#!/usr/bin/env python3
"""
Sample-size calculation for detecting a 0.10 difference in mean VADER compound
score between two models. Variance is estimated from the existing results
(../analysis/results/responses.csv from controversial_snapshot.ipynb).

Usage:
    cd analysis_power
    python power_analysis.py [--delta 0.10] [--power 0.8 0.9] [--nsim 2000]
"""
import argparse
import numpy as np
import pandas as pd
from scipy import stats
from scipy.stats import norm

ap = argparse.ArgumentParser()
ap.add_argument("--delta", type=float, default=0.10, help="effect size in raw VADER units")
ap.add_argument("--power", type=float, nargs="+", default=[0.8, 0.9])
ap.add_argument("--nsim", type=int, default=2000)
ap.add_argument("--responses", default="../analysis/results/responses.csv")
args = ap.parse_args()

# ── empirical variance ───────────────────────────────────────────────────────
r = pd.read_csv(args.responses).dropna(subset=["score"])
cells = r.groupby(["topic", "model"])["score"].agg(["count", "mean", "std"])
df_w = (cells["count"] - 1).sum()
sd_pool = float(np.sqrt(((cells["count"] - 1) * cells["std"] ** 2).sum() / df_w))
resid = (r["score"] - r.groupby(["topic", "model"])["score"].transform("mean")).values
print(f"Cells: {len(cells)}   pooled within-cell SD = {sd_pool:.3f}  (df={df_w})")
print(f"Per-cell SD range: {cells['std'].min():.3f} – {cells['std'].max():.3f}\n")

# ── analytic (two-sample, equal n, two-sided) ────────────────────────────────
def n_t(delta, sd, alpha, power):
    return 2 * ((norm.ppf(1 - alpha / 2) + norm.ppf(power)) * sd / delta) ** 2

ARE_MWU = 0.955  # asymptotic relative efficiency of Mann-Whitney vs t under normality
print(f"Analytic n per group for delta={args.delta}")
print(f"{'sd':>6} {'power':>6} {'t-test':>8} {'MWU':>8} {'MWU+Bonf(3)':>12}")
for sd in sorted({0.30, 0.35, round(sd_pool, 3), 0.45, 0.50}):
    for pw in args.power:
        n = n_t(args.delta, sd, 0.05, pw)
        nb = n_t(args.delta, sd, 0.05 / 3, pw)
        print(f"{sd:>6.3f} {pw:>6.2f} {np.ceil(n):>8.0f} {np.ceil(n/ARE_MWU):>8.0f} {np.ceil(nb/ARE_MWU):>12.0f}")

# ── simulation: resample real residuals, clip to VADER bounds, Mann-Whitney ──
rng = np.random.default_rng(1)
def sim_power(n, delta, alpha, base=0.4):
    hits = 0
    for _ in range(args.nsim):
        a = np.clip(base + rng.choice(resid, n), -1, 1)
        b = np.clip(base + delta + rng.choice(resid, n), -1, 1)
        hits += stats.mannwhitneyu(a, b, alternative="two-sided").pvalue < alpha
    return hits / args.nsim

print(f"\nSimulated Mann-Whitney power (resampled residuals, delta={args.delta}, {args.nsim} sims)")
print(f"{'n/group':>8} {'alpha=.05':>10} {'alpha=.05/3':>12}")
for n in [100, 150, 200, 250, 300, 350, 400]:
    print(f"{n:>8} {sim_power(n, args.delta, 0.05):>10.2f} {sim_power(n, args.delta, 0.05/3):>12.2f}")
