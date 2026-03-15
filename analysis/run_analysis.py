#!/usr/bin/env python3
"""
Standalone analysis: runs each AI model 30 times on the example plot image,
scores with VADER sentiment, then produces:
  results/sentiment_errorbars.png  — mean ± 1 SD per model
  results/word_frequency.png       — top 20 words per model (cleaned)
  results/scores.csv               — raw scores

Usage:
    cd analysis
    pip install -r requirements.txt
    python run_analysis.py [path/to/image.jpg]
"""

import base64, csv, json, os, re, sys, time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import anthropic as anthropic_sdk
import matplotlib.pyplot as plt
import nltk
import numpy as np
import openai as openai_sdk
from scipy import stats
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

nltk.download('stopwords', quiet=True)
from nltk.corpus import stopwords as nltk_stopwords

# ── config ────────────────────────────────────────────────────────────────────

PROMPT  = "Interpret this plot."
N_RUNS  = 30
DELAY_S = 0.5

MODELS = {
    "Claude":  "claude-sonnet-4-20250514",
    "ChatGPT": "gpt-4o",
    "Grok":    "grok-4",
}

# NLTK English stopwords + domain-specific terms to suppress
STOP_WORDS = set(nltk_stopwords.words('english')) | {
    "shows", "show", "plot", "graph", "data", "figure", "chart", "image",
    "line", "lines", "values", "value", "number", "numbers", "time",
    "trend", "trends", "overall", "however", "also",
}

# ── env & clients ─────────────────────────────────────────────────────────────

def load_dotenv(p: Path):
    if not p.exists(): return
    for line in p.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

load_dotenv(Path(__file__).parent.parent / ".env.local")

anthropic_client = anthropic_sdk.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
openai_client    = openai_sdk.OpenAI(api_key=os.environ["OPENAI_API_KEY"])
xai_client       = openai_sdk.OpenAI(
    api_key  = os.environ.get("XAI_API_KEY") or os.environ.get("AI_API_KEY", ""),
    base_url = "https://api.x.ai/v1",
)
vader = SentimentIntensityAnalyzer()

# ── API callers ───────────────────────────────────────────────────────────────

def call_claude(b64, mt):
    r = anthropic_client.messages.create(
        model="claude-sonnet-4-20250514", max_tokens=1024, temperature=1,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
            {"type": "text",  "text": PROMPT},
        ]}],
    )
    return next((b.text for b in r.content if b.type == "text"), "")

def call_compat(client, model, b64, mt):
    r = client.chat.completions.create(
        model=model, max_tokens=1024, temperature=1,
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{mt};base64,{b64}"}},
            {"type": "text",      "text": PROMPT},
        ]}],
    )
    return r.choices[0].message.content or ""

CALLERS = {
    "Claude":  lambda b64, mt: call_claude(b64, mt),
    "ChatGPT": lambda b64, mt: call_compat(openai_client, MODELS["ChatGPT"], b64, mt),
    "Grok":    lambda b64, mt: call_compat(xai_client,    MODELS["Grok"],    b64, mt),
}

# ── trial loop ────────────────────────────────────────────────────────────────

def run_trials(b64, mt):
    scores = {k: [] for k in CALLERS}
    texts  = {k: [] for k in CALLERS}
    for i in range(1, N_RUNS + 1):
        print(f"  Run {i:>2}/{N_RUNS}", end="  ", flush=True)
        for name, caller in CALLERS.items():
            try:
                text = caller(b64, mt)
                s = vader.polarity_scores(text)["compound"]
                scores[name].append(s)
                texts[name].append(text)
                print(f"{name}={s:+.3f}", end="  ", flush=True)
            except Exception as e:
                scores[name].append(None)
                texts[name].append("")
                print(f"{name}=ERR({e})", end="  ", flush=True)
        print()
        if i < N_RUNS:
            time.sleep(DELAY_S)
    return scores, texts

# ── stats ─────────────────────────────────────────────────────────────────────

def descriptive(vals):
    v = np.array([x for x in vals if x is not None], dtype=float)
    return dict(n=len(v), mean=v.mean(), sd=v.std(ddof=1) if len(v)>1 else 0.0,
                median=np.median(v), min=v.min(), max=v.max())

def significance_tests(scores):
    groups = {k: np.array([x for x in v if x is not None]) for k, v in scores.items()}
    H, p_kw = stats.kruskal(*groups.values())
    pairs = [("Claude","ChatGPT"), ("Claude","Grok"), ("ChatGPT","Grok")]
    pairwise = {}
    for a, b in pairs:
        U, p = stats.mannwhitneyu(groups[a], groups[b], alternative="two-sided")
        p_bonf = min(p * len(pairs), 1.0)
        r = 1 - (2 * U) / (len(groups[a]) * len(groups[b]))
        pairwise[f"{a} vs {b}"] = dict(U=U, p_raw=p, p_bonf=p_bonf, r=r)
    return dict(H=H, p_kw=p_kw, pairwise=pairwise)

# ── word frequency ────────────────────────────────────────────────────────────

def word_counts(text_list, top_n=20):
    words = re.findall(r"[a-z]+", " ".join(text_list).lower())
    filtered = [w for w in words if w not in STOP_WORDS and len(w) > 2]
    return Counter(filtered).most_common(top_n)

# ── plots ─────────────────────────────────────────────────────────────────────

COLOURS = {"Claude": "#d97706", "ChatGPT": "#16a34a", "Grok": "#2563eb"}

def plot_errorbars(desc, out_path):
    names  = list(desc.keys())
    means  = [desc[k]["mean"] for k in names]
    sds    = [desc[k]["sd"]   for k in names]
    colors = [COLOURS[k] for k in names]

    fig, ax = plt.subplots(figsize=(7, 5))
    bars = ax.bar(names, means, yerr=sds, capsize=8, color=colors,
                  alpha=0.85, error_kw=dict(elinewidth=1.5, ecolor="black"))
    ax.axhline(0, color="black", linewidth=0.8, linestyle="--", alpha=0.4)
    ax.set_ylabel("VADER Compound Score")
    ax.set_title(f"Mean Sentiment ± 1 SD  (n={list(desc.values())[0]['n']} runs each)")
    ax.set_ylim(-1.1, 1.1)

    for bar, mean, sd in zip(bars, means, sds):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + sd + 0.04,
                f"{mean:+.3f}", ha="center", va="bottom", fontsize=9)

    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    print(f"Saved: {out_path.name}")

def plot_word_freq(texts, out_path, top_n=20):
    # Get top_n words overall, then count per model
    all_words = re.findall(r"[a-z]+", " ".join(
        w for wlist in texts.values() for w in wlist).lower())
    top_words = [w for w, _ in Counter(
        w for w in all_words if w not in STOP_WORDS and len(w) > 2
    ).most_common(top_n)]

    model_counts = {}
    for name, text_list in texts.items():
        words = re.findall(r"[a-z]+", " ".join(text_list).lower())
        c = Counter(w for w in words if w not in STOP_WORDS and len(w) > 2)
        model_counts[name] = [c.get(w, 0) for w in top_words]

    names   = list(texts.keys())
    x       = np.arange(len(top_words))
    width   = 0.25
    offsets = [-width, 0, width]

    fig, ax = plt.subplots(figsize=(14, 5))
    for i, name in enumerate(names):
        ax.bar(x + offsets[i], model_counts[name], width, label=name,
               color=COLOURS[name], alpha=0.85)

    ax.set_xticks(x)
    ax.set_xticklabels(top_words, rotation=40, ha="right", fontsize=9)
    ax.set_ylabel("Frequency (across 30 runs)")
    ax.set_title(f"Top {top_n} Words by Model  (stop words removed)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    print(f"Saved: {out_path.name}")

# ── CSV + JSON ────────────────────────────────────────────────────────────────

def save_csv(scores, texts, out_dir):
    p = out_dir / "scores.csv"
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["run", *scores.keys()])
        for i, row in enumerate(zip(*scores.values()), 1):
            w.writerow([i, *row])
    print(f"Saved: {p.name}")

    r = out_dir / "responses.csv"
    with open(r, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["run", "model", "score", "response"])
        for model in scores:
            for i, (s, t) in enumerate(zip(scores[model], texts[model]), 1):
                w.writerow([i, model, s, t])
    print(f"Saved: {r.name}")

def word_overlap(texts, top_n=20):
    top_sets = {}
    top_lists = {}
    for name, text_list in texts.items():
        words = re.findall(r"[a-z]+", " ".join(text_list).lower())
        filtered = [w for w in words if w not in STOP_WORDS and len(w) > 2]
        top = [w for w, _ in Counter(filtered).most_common(top_n)]
        top_sets[name]  = set(top)
        top_lists[name] = top

    names  = list(texts.keys())
    pairs  = [(names[0], names[1]), (names[0], names[2]), (names[1], names[2])]
    triple = top_sets[names[0]] & top_sets[names[1]] & top_sets[names[2]]

    pairwise = {}
    for a, b in pairs:
        shared = sorted(top_sets[a] & top_sets[b])
        pairwise[f"{a} vs {b}"] = {"count": len(shared), "words": shared}

    return {
        "top_n":     top_n,
        "top_words": {k: v for k, v in top_lists.items()},
        "pairwise":  pairwise,
        "triple":    {"count": len(triple), "words": sorted(triple)},
    }

def save_json(desc, tests, overlap, image_path, out_dir):
    payload = {
        "image":          image_path.name,
        "prompt":         PROMPT,
        "n_runs":         N_RUNS,
        "timestamp":      datetime.now(timezone.utc).isoformat(),
        "models":         desc,
        "kruskal_wallis": tests["kruskal"],
        "pairwise":       tests["pairwise"],
        "word_overlap":   overlap,
    }
    p = out_dir / "stats.json"
    p.write_text(json.dumps(payload, indent=2))
    print(f"Saved: {p.name}")

# ── report ────────────────────────────────────────────────────────────────────

def sig_stars(p):
    return "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else "ns"

def print_report(desc, tests):
    W = 60
    print("\n" + "=" * W)
    print("  RESULTS")
    print("=" * W)
    print(f"  {'Model':<10} {'Mean':>8} {'SD':>8} {'Median':>8} {'Min':>8} {'Max':>8}")
    print(f"  {'─'*10} {'─'*8} {'─'*8} {'─'*8} {'─'*8} {'─'*8}")
    for name, d in desc.items():
        print(f"  {name:<10} {d['mean']:>+8.4f} {d['sd']:>8.4f} "
              f"{d['median']:>+8.4f} {d['min']:>+8.4f} {d['max']:>+8.4f}")
    print(f"\n  Kruskal-Wallis: H={tests['H']:.3f}  p={tests['p_kw']:.4f}  {sig_stars(tests['p_kw'])}")
    print(f"\n  Pairwise (Bonferroni corrected):")
    for pair, r in tests["pairwise"].items():
        print(f"    {pair:<20}  p={r['p_bonf']:.4f} {sig_stars(r['p_bonf'])}  r={r['r']:+.3f}")
    print("=" * W)

# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 \
        else Path(__file__).parent.parent / "public" / "example.jpg"

    if not image_path.exists():
        sys.exit(f"error: image not found: {image_path}")

    out_dir = Path(__file__).parent.parent / "public" / "analysis"
    out_dir.mkdir(exist_ok=True)

    mt  = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    b64 = base64.b64encode(image_path.read_bytes()).decode()

    print(f"Image : {image_path.name}")
    print(f"Runs  : {N_RUNS} per model  ({N_RUNS * len(CALLERS)} total API calls)\n")

    scores, texts = run_trials(b64, mt)

    save_csv(scores, texts, out_dir)
    desc    = {k: descriptive(v) for k, v in scores.items()}
    tests   = significance_tests(scores)
    overlap = word_overlap(texts)
    save_json(desc, tests, overlap, image_path, out_dir)
    print_report(desc, tests)

    plot_errorbars(desc,  out_dir / "sentiment_errorbars.png")
    plot_word_freq(texts, out_dir / "word_frequency.png")
