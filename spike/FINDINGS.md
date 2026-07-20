# #73 Phase 0 spike — findings

**Verdict: FEASIBLE.** An ellmer tool can trigger a board flush, await it via
`session$onFlushed` without deadlocking the stream, and return a value derived
from post-flush block results — all within one running turn against a real
ellmer chat and the real `shinychat::chat_server` streaming path. Proceed to the
design.

## What was proven

Three complementary probes, all passing (`spike/probe-*.R`):

1. **`probe-mechanism.R`** — deterministic, no LLM. A tool body that stages a
   change, invalidates a downstream "block result" reactive, and returns
   `promise(\(resolve, reject) session$onFlushed(\() resolve(isolate(result)), once = TRUE))`,
   run inside a real `shiny::ExtendedTask` worker (the exact wrapper shinychat
   uses), resolves with the post-flush value. No deadlock.

2. **`probe-e2e.R`** — real Anthropic chat (`claude-haiku-4-5-20251001`). The
   model stages via `add_block`, then calls an async `commit` tool. ellmer's
   async tool path awaits the onFlushed promise; the model receives the touched
   block's post-flush result (`ROWCOUNT=4173`) as the tool's own result,
   in-band, and continues the same turn — its final reply echoes `4173`. The
   pre-flush read was `4000`: reading before the flush returns stale data, so
   the await is load-bearing.

3. **`probe-shinychat.R`** — same, but the turn is driven through
   `shinychat::chat_server` itself (its `ExtendedTask` + `stream_async` path),
   not a bare `chat_async`. Same in-band delivery; final reply echoes `4173`.

## Why it composes (the two structural facts that de-risk it)

- **ellmer awaits promise-returning tools.** `ellmer:::invoke_tool_async` does
  `result <- await(do.call(request@tool, args))`. A tool that returns a promise
  is awaited; its resolved value becomes the tool result.
- **shinychat streams on the async path.** `shinychat::chat_server` runs
  `client$stream_async(...)` inside a `shiny::ExtendedTask`, which reaches
  `invoke_tools_async`. While the commit tool's onFlushed-promise is pending,
  control returns to the Shiny main loop, the flush runs, `onFlushed` fires, the
  promise resolves, and the stream resumes — all cooperatively on `later`, no
  blocking.

## Design implications (resolving the issue's TBDs)

- **Delivery is the only change.** Reuse `flush_pending()` (`R/staging.R`) to
  dispatch and `collect_touched_results()` + `format_flush_feedback()`
  (`R/flush-outcome.R`) to compose the review — the same functions the deferred
  `auto_react()` path uses today. Swap the sink from
  `mod$update_user_input(submit = TRUE)` to the tool's return value.
- **Tool name / args.** `commit` (no arguments) reads well and works — the probe
  tool had an empty argument schema and Anthropic called it fine. It applies the
  whole staged batch atomically (the issue's granularity decision).
- **Await the right signals, and bound them.** The probes resolved in a single
  flush. A real board flush is not always one cycle: `update(payload)` dispatches
  (`board$last_update`), then block re-evaluation completes on a later flush
  (`onFlushed`), and chained / async blocks may need more. The production tool
  must await the **same** `board$last_update` → `onFlushed` chain the current
  deferred observer already uses — not a single naive `onFlushed` — and put a
  `later`-scheduled timeout around it so a hanging block eval can't stall the
  turn.
- **Backstop.** Keep the turn-end flush for anything staged-but-not-committed,
  nudging on the structural signal "staged, ended the turn without committing"
  (the clean replacement for #63's prose-regex tripwire).
- **System prompt.** Teach stage → commit → observe; drop "applies at turn end."

## Not a blocker, but flag for the build

The mutation and commit tools now run on ellmer's **async** path (they already do
under shinychat). The commit tool *must* return a promise; the existing
synchronous tools are unaffected (a plain value is valid on the async path too).
