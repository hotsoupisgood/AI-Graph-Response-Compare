#!/usr/bin/env python3
"""
Analyse results/power_responses.csv (from power_study.py). Offline, no API calls.

Outputs (results/):
  power_descriptives.csv   per topic x model: n, mean, sd, 95% CI, share |score|>0.9
  power_tests.json         per topic: Kruskal-Wallis + 3 pairwise Mann-Whitney (alpha/3),
                           Cliff's delta, bootstrap 95% CI on the mean difference
  power_means_ci.png       mean VADER compound with 95% CI per topic x model
  power_sentence_tests.json same tests on mean sentence-level compound (ceiling check)

Usage:  python analyse_power_study.py [--pilot-check]
  --pilot-check : only print the pooled SD and the recomputed n (plan step 1).
"""
import argparse, json, re
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy import stats
from scipy.stats import norm
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

OUT = Path(__file__).parent / "results"
MODELS = ["Claude", "ChatGPT", "Grok"]
PAIRS = [("Claude", "ChatGPT"), ("Claude", "Grok"), ("ChatGPT", "Grok")]
COLOURS = {"Claude": "#d97706", "ChatGPT": "#16a34a", "Grok": "#2563eb"}
ALPHA, DELTA, N_BOOT = 0.05, 0.10, 5000
rng = np.random.default_rng(1)

def pooled_sd(df):
    g = df.groupby(["topic", "model"])["score"].agg(["count", "std"])
    g = g[g["count"] > 1]
    return float(np.sqrt(((g["count"] - 1) * g["std"] ** 2).sum() / (g["count"] - 1).sum())), g

def n_required(sd, alpha, power):
    return int(np.ceil(2 * ((norm.ppf(1 - alpha / 2) + norm.ppf(power)) * sd / DELTA) ** 2 / 0.955))

def cliffs_delta(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float((np.sign(a[:, None] - b[None, :])).mean())

def boot_ci_diff(a, b):
    a, b = np.asarray(a), np.asarray(b)
    d = [rng.choice(a, len(a)).mean() - rng.choice(b, len(b)).mean() for _ in range(N_BOOT)]
    return [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]

def run_tests(df, col):
    out = {}
    for topic, sub in df.groupby("topic"):
        groups = {m: sub.loc[sub.model == m, col].dropna().values for m in MODELS}
        groups = {m: v for m, v in groups.items() if len(v) >= 2}
        res = {"n": {m: int(len(v)) for m, v in groups.items()}}
        if len(groups) >= 2:
            H, p = stats.kruskal(*groups.values()); res["kruskal"] = {"H": float(H), "p": float(p)}
        res["pairwise"] = {}
        for a, b in PAIRS:
            if a in groups and b in groups:
                U, p = stats.mannwhitneyu(groups[a], groups[b], alternative="two-sided")
                res["pairwise"][f"{a} vs {b}"] = {
                    "mean_diff": float(groups[a].mean() - groups[b].mean()),
                    "boot_ci95": boot_ci_diff(groups[a], groups[b]),
                    "U": float(U), "p_raw": float(p), "p_bonf": float(min(p * 3, 1)),
                    "significant_at_alpha_over_3": bool(p < ALPHA / 3),
                    "cliffs_delta": cliffs_delta(groups[a], groups[b])}
        out[topic] = res
    return out

def plot_means(desc, path):
    topics = list(dict.fromkeys(desc["topic"]))
    fig, ax = plt.subplots(figsize=(9, 4.5))
    x = np.arange(len(topics)); w = 0.25
    for i, m in enumerate(MODELS):
        d = desc[desc.model == m].set_index("topic").reindex(topics)
        ax.errorbar(x + (i - 1) * w, d["mean"], yerr=[d["mean"] - d["ci_lo"], d["ci_hi"] - d["mean"]],
                    fmt="o", color=COLOURS[m], ecolor=COLOURS[m], elinewidth=2, capsize=4, ms=7, label=m)
    ax.axhline(0, color="#999", lw=0.8, ls="--")
    ax.set_xticks(x); ax.set_xticklabels(topics)
    ax.set_ylabel("Mean VADER compound (95% CI)"); ax.set_ylim(-1, 1)
    ax.spines[["top", "right"]].set_visible(False); ax.grid(axis="y", color="#eee")
    ax.legend(frameon=False, title=None)
    ax.set_title("Model sentiment by topic")
    fig.tight_layout(); fig.savefig(path, dpi=150); plt.close(fig)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--pilot-check", action="store_true")
    args = ap.parse_args()
    df = pd.read_csv(OUT / "power_responses.csv").dropna(subset=["score"])
    sd, cells = pooled_sd(df)
    print(f"rows={len(df)}  pooled within-cell SD={sd:.3f}")
    print(cells.round(3).to_string())
    print(f"\nRecomputed n per cell for delta={DELTA}, alpha/3, power .80: {n_required(sd, ALPHA/3, .8)}"
          f"   (alpha .05: {n_required(sd, ALPHA, .8)})")
    print("Decision rule: SD <= 0.42 -> continue to n=300; otherwise use the recomputed n above.")
    if args.pilot_check: raise SystemExit

    # descriptives with 95% CI (t-based) and ceiling share
    def summ(v):
        n = len(v); m = v.mean(); se = v.std(ddof=1) / np.sqrt(n) if n > 1 else np.nan
        h = stats.t.ppf(0.975, n - 1) * se if n > 1 else np.nan
        return pd.Series(dict(n=n, mean=m, sd=v.std(ddof=1), ci_lo=m - h, ci_hi=m + h,
                              share_abs_gt_0_9=(v.abs() > 0.9).mean()))
    desc = df.groupby(["topic", "model"])["score"].apply(summ).unstack().reset_index()
    desc.to_csv(OUT / "power_descriptives.csv", index=False)
    print("\n", desc.round(3).to_string())

    tests = run_tests(df, "score")
    (OUT / "power_tests.json").write_text(json.dumps(tests, indent=2))
    for t, r in tests.items():
        print(f"\n{t}: KW p={r.get('kruskal',{}).get('p',float('nan')):.4f}")
        for k, v in r["pairwise"].items():
            print(f"  {k:<18} diff={v['mean_diff']:+.3f} CI{v['boot_ci95'][0]:+.3f}..{v['boot_ci95'][1]:+.3f}"
                  f"  p_bonf={v['p_bonf']:.4f}  delta={v['cliffs_delta']:+.3f}")

    # sentence-level VADER (ceiling check)
    vader = SentimentIntensityAnalyzer()
    def sent_mean(text):
        s = [x for x in re.split(r"(?<=[.!?])\s+|\n+", str(text)) if len(x.strip()) > 3]
        return np.mean([vader.polarity_scores(x)["compound"] for x in s]) if s else np.nan
    df["sent_score"] = df["response"].map(sent_mean)
    (OUT / "power_sentence_tests.json").write_text(json.dumps(run_tests(df, "sent_score"), indent=2))

    plot_means(desc, OUT / "power_means_ci.png")
    print(f"\nSaved -> {OUT}")

    # ── export for the GitHub Pages site (docs/) ─────────────────────────────
    SITE = Path(__file__).parent.parent / "docs" / "data"; SITE.mkdir(parents=True, exist_ok=True)
    desc.to_csv(SITE / "descriptives.csv", index=False)
    df[["topic", "model", "model_id", "run", "score", "n_chars"]].to_csv(SITE / "scores.csv", index=False)
    (SITE / "responses.json").write_text(json.dumps(
        {f"{r.topic}|{r.model}|{r.run}": r.response for r in df.itertuples()}, ensure_ascii=False))
    # per-word VADER contributions: replicate polarity_scores' token loop so negation/boosters are applied
    from vaderSentiment.vaderSentiment import SentiText, BOOSTER_DICT
    def token_valences(text):
        st = SentiText(str(text).strip()); words = st.words_and_emoticons; sents = []
        for i, item in enumerate(words):
            if item.lower() in BOOSTER_DICT or (i < len(words)-1 and item.lower() == "kind" and words[i+1].lower() == "of"):
                sents.append(0); continue
            sents = vader.sentiment_valence(0, st, item, i, sents)
        sents = vader._but_check(words, sents)
        return [[i, w, round(float(v), 2)] for i, (w, v) in enumerate(zip(words, sents)) if v]
    (SITE / "valence.json").write_text(json.dumps(
        {f"{r.topic}|{r.model}|{r.run}": token_valences(r.response) for r in df.itertuples()}, ensure_ascii=False))
    (SITE / "tests.json").write_text(json.dumps(tests, indent=2))
    sent = json.loads((OUT / "power_sentence_tests.json").read_text())
    tests_meta = {"sentence_sig": sum(v["significant_at_alpha_over_3"] for r in sent.values() for v in r["pairwise"].values()),
                  "sentence_pairs": sum(len(r["pairwise"]) for r in sent.values())}
    (SITE / "meta.json").write_text(json.dumps({
        "generated_utc": pd.Timestamp.utcnow().isoformat(), "rows": int(len(df)),
        "pooled_sd": sd, "delta": DELTA, "target_n": 250, "alpha": ALPHA, "sd_prior": 0.39, "sd_pilot": 0.523, "pilot_n": 50,
        "sampling": "temperature not set: all three models run at provider default sampling (Claude Opus 5 and GPT-5.5 reject a custom temperature; Grok 4.7 default is 1.0), max 4096 output tokens",
        "images": {"CO2 / Climate": "img/co2.png", "COVID deaths & masks": "img/covid.png", "Race & IQ": "img/raceiq.png", "Gender pay gap": "img/paygap.png"}, "models": df.groupby("model")["model_id"].first().to_dict(), **tests_meta}))
    print(f"Site data -> {SITE}")
