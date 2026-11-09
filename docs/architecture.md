# Architecture

## Request flow for `/ask`

| Step | What happens | Safety net |
|---|---|---|
| Greeting shortcut | Exact-match greetings, thanks and goodbyes get a fixed reply. No API calls, about 0.2 s. | none needed |
| Rewrite | One short Claude call turns the message into 1 to 4 plain-English sub-questions (slang and typos spelled out, return and pricing questions expanded). | 3 s timeout, no retries; on failure the original question is searched |
| Embed | One batched Voyage `voyage-3` call for all sub-questions plus the original. | 4 s timeout; one retry with only the original question |
| Search | Each embedding calls the `match_knowledge_chunks` RPC, in parallel (thread pool, one Supabase client per thread because a shared HTTP/2 client raised read errors across threads). | errors return a 503 with a friendly message |
| Merge | Best match of every sub-question first, no duplicates, at most 10 chunks. The `booking` entry is added if missing (cached in memory for 10 minutes). | |
| Generate | Claude answers from the chunks with `ASK_SYSTEM_PROMPT`. | a refusal or empty reply returns a fixed hand-off message |

Typical timings on production were about 3 s for a price question and 6 s for a two-part messy question,
dominated by the rewrite and the answer; search and embedding are a few hundred milliseconds. Every
response has a `Server-Timing` header (`rewrite`, `embed`, `search`, `booking_lookup`, `generate`,
`total`) and the same numbers are logged with the model and stop reason.

## The system prompt

The prompt is deliberately strict because the bot speaks for a business:

- answer only from the retrieved information; never infer a policy, number or yes/no that isn't stated
- never recommend one option over another, promise availability, or invent a link
- say "not specified, ask the owner" instead of "no" when the information is silent
- health and safety rules: never diagnose, recommend a medical professional, and give the owner's contact
- the customer's text is wrapped in `<question>` tags and treated only as a question

Newer models also get a short "keep answers brief" note (see [model-migration.md](model-migration.md)).

## Owner tools

`/draft-text` drafts a customer text and saves it as `pending_approval`; `/owner-messages` lists drafts and
`/owner-messages/{id}/approve` approves one. `/schedule` and `/day-summary` read appointments through
`appointments.get_appointments()`, the only function that knows where appointments come from (mock data
today). All owner routes require a Supabase login and an email on the `OWNER_EMAIL` list; the two routes that
call Claude (`/draft-text` and `/day-summary`) are also rate limited.

## Data model

- `knowledge_chunks`: one row per knowledge entry, embedded together with its id (the id often carries key
  terms such as `policy-late-arrival`). `embed_knowledge.py` inserts the new rows before deleting the old
  ones so a failure never leaves the bot with an empty knowledge base.
- `owner_messages`: drafts and their approval status.
