# ai-chat-assistant

A retrieval-augmented chatbot and owner toolkit for a lash extension studio. Customers ask about services,
prices, booking and policies and get answers drawn only from a small knowledge base; the owner gets a
login-protected dashboard for drafting customer texts and summarizing the day's schedule.

> **About the data in this repo.** The business in the prompts, UI and example data is a placeholder:
> "Example Lash Studio", owned by "Jane". The phone number, email address, links, social handle and every
> price in `backend/data/kb_testset.example.json` are fictional. Replace them with your own business's
> details. The real knowledge base is kept out of the repository.

## What it does

- **Customer chat (`/ask`)**: answers questions strictly from the knowledge base, hands off to the owner when
  the answer isn't there, holds the line against discount requests and prompt-extraction attempts, and
  gives safe, non-diagnostic replies to health questions.
- **Owner dashboard**: log in, draft a text message to a customer with Claude, review and approve it, view
  the day's schedule and an AI-written summary of it (appointments are mock data for now, behind one
  function that can be swapped for a real booking API).
- **Evaluation suite**: a 94-question test set scored by an LLM judge, used to catch regressions whenever a
  prompt or model changes.

## Architecture

```
Next.js (Vercel) ──► FastAPI (Railway) ──► Voyage AI   (query embeddings, voyage-3)
                           │          ├──► Supabase    (pgvector search, owner tables, auth)
                           │          └──► Claude      (query rewriter, answers, owner drafts)
```

`/ask` runs these steps (see [docs/architecture.md](docs/architecture.md) for details):

1. Greeting shortcut: "hi", "thanks" and similar get a fixed reply with no API calls.
2. A short Claude call rewrites the message into 1 to 4 plain-English sub-questions (3 s timeout, falls back
   to the original question).
3. One batched Voyage call embeds them (4 s timeout, retries once with the original question only).
4. The sub-questions are searched in parallel in Supabase, the results are merged round-robin (at most 10
   chunks), and the cached booking entry is added if it is missing.
5. Claude answers from those chunks with a strict system prompt.

Each response carries a `Server-Timing` header and a log line with the time spent in every step.

## Repository layout

```
backend/
  main.py                 FastAPI app: /ask, owner routes, auth, rate limiting
  appointments.py         mock schedule behind get_appointments()
  embed_knowledge.py      embeds the knowledge base into Supabase
  eval.py                 runs the test set against a backend and judges the answers
  calibrate_judge.py      compares two judge models on saved answers
  eval_server.py          starts the backend for evals on the eval-only API key
  data/kb_testset.example.json   example knowledge base + test set
frontend/                 Next.js app: customer chat, login, owner dashboard
docs/                     architecture, evaluation, model migration notes
```

## Setup

### 1. Supabase

Create a project and enable the `vector` extension. The code expects:

- `knowledge_chunks(id, source_file, heading, content, embedding vector(1024))`
- an RPC `match_knowledge_chunks(query_embedding vector(1024), match_count int)` that returns the nearest
  rows with at least `heading` and `content`
- `owner_messages(id, customer_name, purpose, draft_text, status, created_at)`, where `status` starts as
  `pending_approval`
- row-level security so that the publishable key can only read knowledge; the secret key is used server-side
  for the owner tables and for embedding
- Supabase Auth with an email and password user for each owner

An illustrative sketch (adjust to your project):

```sql
create extension if not exists vector;
create table knowledge_chunks (
  id bigint generated always as identity primary key,
  source_file text, heading text, content text, embedding vector(1024)
);
create or replace function match_knowledge_chunks(query_embedding vector(1024), match_count int)
returns table (id bigint, heading text, content text, source_file text, similarity float)
language sql stable as $$
  select id, heading, content, source_file, 1 - (embedding <=> query_embedding)
  from knowledge_chunks order by embedding <=> query_embedding limit match_count;
$$;
create table owner_messages (
  id bigint generated always as identity primary key,
  customer_name text, purpose text, draft_text text,
  status text default 'pending_approval', created_at timestamptz default now()
);
```

### 2. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate      # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # then fill in the values
cp data/kb_testset.example.json data/kb_testset.json  # then replace the example values with your own
python embed_knowledge.py                             # embeds the knowledge base into Supabase
uvicorn main:app --reload
```

`data/kb_testset.json` is git-ignored on purpose, so a real knowledge base never gets committed.

CORS origins are set in `main.py`; add your own frontend domain there.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_KEY=...        # the publishable key
```

then `npm run dev` and open http://localhost:3000. The owner dashboard is at `/owner`.

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | backend | Claude calls |
| `VOYAGE_API_KEY` | backend | embeddings |
| `SUPABASE_URL`, `SUPABASE_KEY` | backend | public (read-only) client |
| `SUPABASE_SECRET_KEY` | backend | owner routes and `embed_knowledge.py`; never expose it |
| `OWNER_EMAIL` | backend | comma-separated emails allowed into the owner routes |
| `BUSINESS_TIMEZONE` | backend | e.g. `America/New_York`, so "today" is correct on a UTC server |
| `BOT_MODEL`, `REWRITE_MODEL`, `OWNER_MODEL`, `BOT_EFFORT` | backend | optional model settings, see below |
| `EVAL_ANTHROPIC_API_KEY` | eval scripts only | separate key for evals, never set on the live server |

### Models

The code defaults to `claude-sonnet-5-5` with effort `low` (`BOT_EFFORT`, only sent to `claude-*-5`
models), so a fresh deployment needs no model settings. `BOT_MODEL` moves `/ask`, the query rewriter and
the owner routes together; `REWRITE_MODEL` and `OWNER_MODEL` override the rewriter and the owner routes
individually. `claude-sonnet-4-5` can still be selected with `BOT_MODEL`, but **Anthropic retires it on
2026-11-30**. Switching is an environment change, not a deploy. Details and the evaluation results are in
[docs/model-migration.md](docs/model-migration.md).

## Evaluation

```bash
cd backend
python eval_server.py            # starts the backend on the eval key
python eval.py --url http://localhost:8000
```

See [docs/evaluation.md](docs/evaluation.md) for the question types, how scores are counted, and the judge
calibration tool.

## Security notes

- The public chat endpoint is rate limited per client IP (10 requests a minute) and validates input length.
- Owner routes require a Supabase login and an email on the `OWNER_EMAIL` list.
- Two Supabase keys: a publishable key for reads and a secret key that never leaves the server.
- Secrets live in `.env` files that are git-ignored; `.env.example` lists the variables with blank values.
- The system prompt treats the customer's message as a question to answer, never as instructions.

## License

MIT. See [LICENSE](LICENSE).
