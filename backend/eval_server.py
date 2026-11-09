"""Run the backend locally for evals, with every Claude call billed to the eval-only key.

The evals send their questions to a running backend, and that backend calls Claude too (the rewriter and
the answer). Start it with this script, not with plain uvicorn, so none of that spend lands on the
production key:

    python eval_server.py            # then, in another terminal: python eval.py --url http://localhost:8000
    BOT_MODEL=claude-sonnet-5-5 REWRITE_MODEL=claude-sonnet-5-5 python eval_server.py
"""
import os
import sys
import argparse

from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, ".env"))

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument("--port", type=int, default=8000)
args = parser.parse_args()

eval_key = os.getenv("EVAL_ANTHROPIC_API_KEY")
if not eval_key:
    sys.exit("EVAL_ANTHROPIC_API_KEY is missing from backend/.env (see .env.example). Not starting.")
if eval_key == os.getenv("ANTHROPIC_API_KEY"):
    sys.exit("EVAL_ANTHROPIC_API_KEY is the same key as ANTHROPIC_API_KEY (production). Use a separate key. Not starting.")

# main.py calls load_dotenv() without override, so a key already in the environment wins over .env
os.environ["ANTHROPIC_API_KEY"] = eval_key
print("Starting the backend for evals: Claude calls are billed to the eval key.", flush=True)

import uvicorn  # noqa: E402

if __name__ == "__main__":
    sys.path.insert(0, HERE)
    uvicorn.run("main:app", host="127.0.0.1", port=args.port)
