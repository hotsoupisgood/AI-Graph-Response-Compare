#!/usr/bin/env python3
"""
Powered sentiment comparison: N runs per model per topic, VADER compound scored.
Append-only cache (results/power_responses.csv) keyed by (topic, model, run), so
the job can be stopped and resumed; existing successful rows are skipped.

Usage:
    cd analysis_power
    python power_study.py --n 1              # smoke test (12 calls)
    python power_study.py --n 50             # pilot
    python power_study.py --n 300            # top up to full n
"""
import argparse, base64, csv, fcntl, os, threading, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import anthropic as anthropic_sdk
import openai as openai_sdk
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

PROMPT = "Interpret this plot."
MODELS = {"Claude": "claude-opus-5", "ChatGPT": "gpt-5.5", "Grok": "grok-4.7"}
TOPICS = {
    "CO2 / Climate":        "co2.png",
    "COVID deaths & masks": "covid.png",
    "Race & IQ":            "raceiq.png",
    "Gender pay gap":       "paygap.png",
}
BASE = Path(__file__).parent
PLOTS = BASE.parent / "analysis" / "plots"
OUT = BASE / "results"; OUT.mkdir(exist_ok=True)
CSV = OUT / "power_responses.csv"
FIELDS = ["topic", "model", "model_id", "run", "score", "n_chars", "finish_reason",
          "timestamp_utc", "response"]

def load_dotenv(p):
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("="); os.environ.setdefault(k.strip(), v.strip())
load_dotenv(BASE.parent / ".env.local")

anthropic_client = anthropic_sdk.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], max_retries=3)
openai_client = openai_sdk.OpenAI(api_key=os.environ["OPENAI_API_KEY"], max_retries=3)
xai_client = openai_sdk.OpenAI(api_key=os.environ.get("XAI_API_KEY") or os.environ["AI_API_KEY"],
                               base_url="https://api.x.ai/v1", max_retries=3)
vader = SentimentIntensityAnalyzer()

def call_claude(b64, mt):
    # Opus 5: no temperature param (rejected); default sampling, adaptive thinking on by default.
    r = anthropic_client.messages.create(
        model=MODELS["Claude"], max_tokens=4096,
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
            {"type": "text", "text": PROMPT}]}])
    return next((b.text for b in r.content if b.type == "text"), ""), r.stop_reason

def call_compat(client, model, b64, mt):
    r = client.chat.completions.create(
        model=model, max_completion_tokens=4096,
        messages=[{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:{mt};base64,{b64}"}},
            {"type": "text", "text": PROMPT}]}])
    return r.choices[0].message.content or "", r.choices[0].finish_reason

CALLERS = {
    "Claude":  call_claude,
    "ChatGPT": lambda b, m: call_compat(openai_client, MODELS["ChatGPT"], b, m),
    "Grok":    lambda b, m: call_compat(xai_client, MODELS["Grok"], b, m),
}

def done_keys():
    if not CSV.exists(): return set()
    with open(CSV, newline="") as f:
        return {(r["topic"], r["model"], int(r["run"])) for r in csv.DictReader(f) if r["score"] != ""}

lock = threading.Lock()
def write_row(row):
    with lock:
        new = not CSV.exists()
        with open(CSV, "a", newline="") as f:
            fcntl.flock(f, fcntl.LOCK_EX)          # safe across concurrent processes
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new: w.writeheader()
            w.writerow(row); f.flush()
            fcntl.flock(f, fcntl.LOCK_UN)

def one_call(topic, model, run, b64, mt, delay):
    err = ""
    for attempt in range(3):
        try:
            text, fr = CALLERS[model](b64, mt)
            if not text.strip(): raise RuntimeError(f"empty response (finish={fr})")
            row = dict(topic=topic, model=model, model_id=MODELS[model], run=run,
                       score=vader.polarity_scores(text)["compound"], n_chars=len(text),
                       finish_reason=fr, timestamp_utc=datetime.now(timezone.utc).isoformat(),
                       response=text)
            write_row(row); time.sleep(delay); return row
        except Exception as e:
            err = f"{type(e).__name__}: {e}"[:300]
            time.sleep(2 ** attempt * 2)
    write_row(dict(topic=topic, model=model, model_id=MODELS[model], run=run, score="",
                   n_chars=0, finish_reason="ERROR", timestamp_utc=datetime.now(timezone.utc).isoformat(),
                   response=err))
    print(f"  FAIL {model}/{topic}/run{run}: {err}", flush=True)
    return None

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, required=True, help="target runs per model per topic")
    ap.add_argument("--workers", type=int, default=3, help="concurrent workers per provider")
    ap.add_argument("--delay", type=float, default=0.3)
    ap.add_argument("--models", nargs="+", default=list(MODELS), choices=list(MODELS),
                    help="subset of models to run (default: all)")
    a = ap.parse_args()

    imgs = {}
    for t, fn in TOPICS.items():
        p = PLOTS / fn
        imgs[t] = (base64.b64encode(p.read_bytes()).decode(),
                   "image/png" if p.suffix.lower() == ".png" else "image/jpeg")
    done = done_keys()
    todo = [(t, m, r) for r in range(1, a.n + 1) for t in TOPICS for m in a.models
            if (t, m, r) not in done]  # run-major order interleaves models/topics in time
    print(f"Target n={a.n}/cell  already done={len(done)}  to do={len(todo)}", flush=True)

    pools = {m: ThreadPoolExecutor(max_workers=a.workers) for m in a.models}
    futs = {pools[m].submit(one_call, t, m, r, *imgs[t], a.delay): (t, m, r) for t, m, r in todo}
    ok = fail = 0; t0 = time.time()
    for i, f in enumerate(as_completed(futs), 1):
        if f.result(): ok += 1
        else: fail += 1
        if i % 25 == 0 or i == len(futs):
            el = time.time() - t0
            print(f"  {i}/{len(futs)}  ok={ok} fail={fail}  {el/60:.1f} min  "
                  f"eta {el/i*(len(futs)-i)/60:.1f} min", flush=True)
    for p in pools.values(): p.shutdown()
    print(f"Done. ok={ok} fail={fail}  -> {CSV}")
