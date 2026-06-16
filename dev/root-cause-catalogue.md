# Root-cause catalogue — why assistant-built blocks end up empty

Method: ran 5 clinician-intent prompts as single builds (gpt-5.1), flushed
adds+links, evaluated every block, classified each non-ok block as **ROOT**
(all its upstreams ok → the block itself is wrong) vs **CASCADE** (an upstream
failed → it just inherited garbage). Harness: `/tmp/rootcause.R`.

## Results

| Prompt | Failing block | Class | Root cause |
|---|---|---|---|
| cognition | chart `adas_line` | ROOT | `Columns not found: TRTA, VISITDY` (adqsadas has TRTP, AVISITN) |
| ae_timing | chart | ROOT | `Column not found: AERELDY` (adae has ASTDY) |
| severity | summary_table | ROOT | `Columns not found: TRT01A` (adae has TRTA) |
| severity | table | CASCADE | "Input must be a data frame" |
| liver | 8 blocks (temporal_join/flatten/pulls) | ROOT×many | over-built dm chain → all EMPTY |
| dropouts | 3 pulls (incl. wrong table name) | ROOT | EMPTY (wrong table / mis-wired dm) |

## Deduped root causes (ranked)

1. **Wrong column names — dominant (3/5).** The model references ADaM columns
   absent from that specific table (`TRTA`/`TRT01A` vs `TRTP`, invented
   `VISITDY`/`AERELDY`). Data-dependent facts it can't know a priori; it
   guesses instead of checking, even though the dm schema is in context.
2. **Over-built / mis-wired dm pipelines (2/5).** temporal_join + flatten +
   pulls (sometimes wrong table names) collapse to empty.
3. **Cascades are noise.** One root failure shows up as N downstream
   "not a data frame" empties — report the root, not the symptoms.

## Implication

Both #1 and #2 = the model builds **blind to the real data shape** and guesses.
Static prompt text can't fix it (columns are data-specific). It needs the real
shape at build time.

## Feasibility wall for per-action execution feedback ("B")

`testServer()` **cannot be called inside a live Shiny session** ("for use only
within tests and may not indirectly call itself"). So a staged block cannot be
dry-run mid-turn in the running app. blockr.mcp's headless evaluator works only
because it runs in a separate process; blockr.ai's live validate works because
it mutates an **already-committed** block and reads its live result. The
assistant stages blocks (not live until flush) → nothing to execute mid-turn.

Feasible options instead:
- **B1 immediate-commit:** apply each mutation to the live board as it's made
  (drop stage-till-flush), then read live results like the eval-report does (no
  testServer) → true per-action feedback. Biggest change (touches core staging
  model).
- **B2 static column validation:** extend the existing add_block arg-NAME
  rejection to validate column-VALUE args (group/x/y/by/vars/…) against the
  upstream's columns, resolved from the committed dm / pulled table (no
  execution). Catches the dominant root cause #1. Feasible now; block-specific.
- **B3 force query_data:** require the model to query_data upstream columns
  before referencing them. Cheap, prompt-reliant (weakly effective so far).
