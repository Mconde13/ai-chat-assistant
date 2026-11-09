# Model migration: Claude Sonnet 4.5 to 5.5

`claude-sonnet-4-5` is retired on 2026-11-30. This documents how the app was moved to `claude-sonnet-5-5`
with an eval gate at every step.

## Making the code safe first

Before any model changed, the code was made safe for the newer response shape with no behaviour change:

- models come from environment variables (`BOT_MODEL`, `REWRITE_MODEL`, `OWNER_MODEL`, `BOT_EFFORT`), so a
  switch or a rollback is a variable change, not a deploy
- replies are read from text blocks only (newer models can start with a thinking block)
- a refusal or an empty reply returns a fixed hand-off message from `/ask`, and a 503 from the owner routes
- 5.x models get an effort setting and extra `max_tokens` headroom, because thinking counts toward it
- model-specific settings are keyed on the model each call actually uses, so mixed setups work (for example
  5.5 for the answer and 4.5 for the rewriter)

## What the first 5.5 eval found

Run on the same 94-question set, judged by the same judge:

| Setup | Score |
|---|---|
| 4.5 (baseline) | 86/94 |
| 5.5, effort low, first try | 88/94 |
| 5.5, after the changes below | 91/94, twice |

The first 5.5 run looked fine overall but hid two regressions that the totals averaged away:

1. **The rewriter changed retrieval.** The 5.5 rewriter worded its sub-questions differently, so the "all sales
   are final" and full-set price entries stopped being retrieved, and the bot said it had no information. An
   isolation run (5.5 answers with the 4.5 rewriter) confirmed the rewriter was the whole cause. The rewriter
   prompt now includes the return-policy question and four fixed price sub-questions word for word.
2. **5.5 is wordier.** Median answer length rose from 48 to 82 words, with unrequested extras. A "keep answers
   short" note fixed it on 5.5 (about 51 words) but on 4.5 it dropped required facts and scored 79/94, so the
   note is only added when the answer model is a newer one. The same idea applies to the owner draft prompt.

Latency was about level with 4.5: the median was 5.1 to 5.6 s locally against 5.4 s for 4.5.

## Cutting over

Production was switched by setting `BOT_MODEL=claude-sonnet-5-5` in the host's environment. Rolling back is
deleting that variable, which works until the old model is retired. The first live checks after the switch
returned 13 of 13 requests successfully with a median of 3.8 s.

## Moving the eval judge

The judge had to move too, and a different judge changes the scores. Calibration over 534 saved answers found
the 5.5 judge stricter (51 answers stricter, 6 more lenient), scoring each run 3 to 7 questions lower, with the
same pass or not-pass decision on 93.3%. The judge's blind spots were cases where it could not see facts the bot
had, so the judge is now shown the knowledge base. See [evaluation.md](evaluation.md).

## Lessons

- Gate on the per-type breakdown (adversarial, safety), not just the total.
- When a regression appears, isolate the component (here the rewriter) before changing prompts.
- A prompt tweak that helps one model can hurt another; key it on the model that call uses.
- Keep eval spending on its own key so testing can never take production down.
