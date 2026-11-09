"""Compare the eval judges on answers that were already generated.

Re-judges every distinct (question, answer) pair found in saved eval result files with two judge
models and reports how often they agree, in which direction they differ, and whether any
pass / not-pass decision flips. It makes no calls to the chatbot, only to the judges.

    python calibrate_judge.py                      # the default set of saved runs
    python calibrate_judge.py a.csv b.csv          # specific result files
    python calibrate_judge.py --a claude-sonnet-4-5 --b claude-sonnet-5-5 --out calibration
"""
import os
import csv
import json
import logging
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

import eval as ev

logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("calibrate")

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_RUNS = [
    "eval_results_gate86_sonnet45.csv",
    "eval_results_sonnet45_tuned.csv",
    "eval_results_sonnet45_gated.csv",
    "eval_results_sonnet55_low_run1.csv",
    "eval_results_sonnet55_low_run2.csv",
    "eval_results_sonnet55_low_run3.csv",
]
RANK = {"fail": 0, "partial": 1, "pass": 2}
GATED_TYPES = ("adversarial", "safety")


def load_runs(paths):
    runs = {}
    for path in paths:
        full = path if os.path.isabs(path) else os.path.join(HERE, path)
        with open(full, encoding="utf-8-sig", newline="") as f:
            runs[os.path.basename(path)] = list(csv.DictReader(f))
    return runs


def judge_one(client, item, answer, model, knowledge=None):
    """(verdict, reasoning); a judge that never produces a verdict is recorded as 'error', never scored."""
    try:
        verdict, reasoning, _, _ = ev.judge(client, item, answer, model=model, knowledge=knowledge)
        return verdict, reasoning
    except Exception as e:
        return "error", f"{type(e).__name__}: {e}"


def rate(pairs):
    return f"{sum(pairs)}/{len(pairs)} ({sum(pairs) / len(pairs):.1%})" if pairs else "n/a"


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", help="Result CSVs to re-judge (default: the saved 4.5 and 5.5 runs)")
    parser.add_argument("--a", default="claude-sonnet-4-5", help="Reference judge (default: the current one)")
    parser.add_argument("--b", default="claude-sonnet-5-5", help="Candidate judge")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--kb", action="store_true", help="Show both judges the knowledge base (as eval.py does by default)")
    parser.add_argument("--out", default="calibration", help="Prefix for the output files (.csv and .md)")
    args = parser.parse_args()

    runs = load_runs(args.files or DEFAULT_RUNS)
    with open(ev.TESTSET_PATH, encoding="utf-8") as f:
        items = {t["id"]: t for t in json.load(f)["test_set"]}

    pairs = {}  # (id, answer) -> {"item", "runs", "saved"}
    for name, rows in runs.items():
        for r in rows:
            if r["verdict"] == "error" or not r["answer"].strip() or r["id"] not in items:
                continue
            entry = pairs.setdefault((r["id"], r["answer"]), {"item": items[r["id"]], "runs": [], "saved": {}})
            entry["runs"].append(name)
            entry["saved"][name] = r["verdict"]
    keys = list(pairs)
    logger.info(f"{sum(len(r) for r in runs.values())} saved answers in {len(runs)} files -> {len(keys)} distinct answers to re-judge with {args.a} and {args.b}")

    client = ev.make_eval_client()
    knowledge = ev.load_knowledge() if args.kb else None
    done = [0]

    def work(key):
        entry = pairs[key]
        a = judge_one(client, entry["item"], key[1], args.a, knowledge)
        b = judge_one(client, entry["item"], key[1], args.b, knowledge)
        done[0] += 1
        if done[0] % 25 == 0:
            logger.info(f"judged {done[0]}/{len(keys)}")
        return key, a, b

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for key, a, b in pool.map(work, keys):
            pairs[key].update(a=a[0], a_why=a[1], b=b[0], b_why=b[1])

    rows = []
    for key in keys:
        e = pairs[key]
        item = e["item"]
        rows.append({
            "id": key[0], "type": item["type"], "audience": item.get("audience", ""), "question": item["q"],
            "answer": key[1], "runs": ";".join(e["runs"]), "saved_verdicts": ";".join(sorted(set(e["saved"].values()))),
            "judge_a": e["a"], "judge_a_reason": e["a_why"], "judge_b": e["b"], "judge_b_reason": e["b_why"],
        })
    csv_path = os.path.join(HERE, args.out + ".csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    out = []
    p = out.append
    errors = {"a": sum(r["judge_a"] == "error" for r in rows), "b": sum(r["judge_b"] == "error" for r in rows)}
    ok = [r for r in rows if r["judge_a"] != "error" and r["judge_b"] != "error"]
    gate = lambda v: v == "pass"
    p(f"# Judge calibration: A = {args.a} (current), B = {args.b} (candidate)\n")
    p(f"Judges {'see' if knowledge else 'do not see'} the knowledge base.\n")
    p(f"{len(keys)} distinct answers from {len(runs)} saved runs; judge errors: A {errors['a']}, B {errors['b']}; compared: {len(ok)}.")
    p("Totals count only `pass` as a pass (partial and fail both count against the score), as in eval.py.\n")

    def agreement(label, subset):
        exact = rate([r["judge_a"] == r["judge_b"] for r in subset])
        decision = rate([gate(r["judge_a"]) == gate(r["judge_b"]) for r in subset])
        p(f"| {label} | {len(subset)} | {exact} | {decision} |")

    p("## Agreement\n")
    p("| Group | Answers | Same verdict (pass/partial/fail) | Same pass / not-pass decision |")
    p("|---|---|---|---|")
    agreement("Overall", ok)
    agreement("Adversarial + safety", [r for r in ok if r["type"] in GATED_TYPES])
    for t in ("adversarial", "safety", "unanswerable", "answerable", "partial"):
        agreement(f"  {t}", [r for r in ok if r["type"] == t])

    diff = [r for r in ok if r["judge_a"] != r["judge_b"]]
    lenient = [r for r in diff if RANK[r["judge_b"]] > RANK[r["judge_a"]]]
    strict = [r for r in diff if RANK[r["judge_b"]] < RANK[r["judge_a"]]]
    flips = [r for r in diff if gate(r["judge_a"]) != gate(r["judge_b"])]
    p(f"\n## Direction of the {len(diff)} disagreements\n")
    p(f"- B more lenient than A: {len(lenient)} ({sum(gate(r['judge_b']) and not gate(r['judge_a']) for r in lenient)} of them turn a not-pass into a pass)")
    p(f"- B stricter than A: {len(strict)} ({sum(gate(r['judge_a']) and not gate(r['judge_b']) for r in strict)} of them turn a pass into a not-pass)")
    p(f"- Pass / not-pass decisions that flip: {len(flips)}")
    gated_flips = [r for r in flips if r["type"] in GATED_TYPES]
    p(f"- **Adversarial / safety decisions that flip: {len(gated_flips)}**; any verdict difference on them: {len([r for r in diff if r['type'] in GATED_TYPES])}")

    # the noise floor: how much does judge A disagree with its own earlier verdicts?
    saved_pairs = []
    for r, key in zip(rows, keys):
        if r["judge_a"] == "error":
            continue
        for name, v in pairs[key]["saved"].items():
            saved_pairs.append((v, r["judge_a"]))
    p(f"\n## Noise floor: A today vs A when the run was saved\n")
    p(f"- Same verdict: {rate([a == b for a, b in saved_pairs])}; same pass / not-pass decision: {rate([gate(a) == gate(b) for a, b in saved_pairs])}")

    p("\n## Score per saved run (passes out of the run's answers)\n")
    p(f"| Run | Saved score | A re-judged | B re-judged |")
    p("|---|---|---|---|")
    lookup = {k: (pairs[k].get("a"), pairs[k].get("b")) for k in keys}
    for name, run_rows in runs.items():
        saved = sum(r["verdict"] == "pass" for r in run_rows)
        a_pass = b_pass = n = 0
        for r in run_rows:
            if (r["id"], r["answer"]) in lookup:
                a, b = lookup[(r["id"], r["answer"])]
                n += 1
                a_pass += a == "pass"
                b_pass += b == "pass"
        p(f"| {name} | {saved}/{len(run_rows)} | {a_pass}/{n} | {b_pass}/{n} |")

    def listing(title, subset):
        p(f"\n## {title} ({len(subset)})\n")
        for r in subset:
            direction = "B more lenient" if RANK[r["judge_b"]] > RANK[r["judge_a"]] else "B stricter"
            p(f"### {r['id']} [{r['type']}] A={r['judge_a']} / B={r['judge_b']} ({direction}); runs: {r['runs']}")
            p(f"- Q: {r['question']}")
            p(f"- Answer: {r['answer'][:400].replace(chr(10), ' ')}")
            p(f"- A: {r['judge_a_reason']}")
            p(f"- B: {r['judge_b_reason']}\n")

    listing("Pass / not-pass decisions that flip", flips)
    listing("Disagreements that do not change pass / not-pass (partial vs fail)", [r for r in diff if r not in flips])
    p("\n## What judge B gives q22 and q45\n")
    for qid in ("q22", "q45"):
        for r in [x for x in rows if x["id"] == qid]:
            p(f"- {qid} [{r['runs']}] A={r['judge_a']} B={r['judge_b']}: B says: {r['judge_b_reason']}")
    md_path = os.path.join(HERE, args.out + ".md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("\n".join(out[: out.index(f"\n## Pass / not-pass decisions that flip ({len(flips)})\n")] if f"\n## Pass / not-pass decisions that flip ({len(flips)})\n" in out else out))
    print(f"\nFull report with every disagreement: {md_path}\nPer-answer results: {csv_path}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
    main()
