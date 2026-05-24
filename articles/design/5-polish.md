# Context, examples and polish

## Goal

Phase 5 closes the initial roadmap by giving the model the *context* it
needs to use the Phase 2 + Phase 4 tool surface well, and giving the
*user* the docs and demos needed to adopt the package. No new LLM-facing
tools, no new staging semantics — what ships is:

- A turn-by-turn refreshed system prompt that bundles a static intro /
  conventions block, an auto-generated tool catalogue, and a compact
  summary of the current board.
- A small feedback channel that tells the model when its previous turn’s
  flushed payload was rejected at dispatch (so it can recover on the
  next turn without the user having to retype the error).
- A top-level tutorial vignette, an example app catalogue, and a pkgdown
  site organised around “use it” / “extend it” / “how it works”.
- A README that reflects the full feature set rather than the Phase 1
  ceiling.

The interesting architectural piece is the prompt-context layer: every
earlier phase has carved out a hole for it (“the model only sees the
board through tool calls”, “the flush rejection is invisible to the
model unless the user types it back”, “the tool list is hard-coded into
the prompt”), and Phase 5 fills that hole. The rest is documentation
work that is mechanical once the package surface settles.

## Scope

In:

- A `default_system_prompt(board, client, last_flush, ...)` function
  that builds the four-section prompt. It’s the default value of
  `new_assistant_extension`’s `system_prompt` argument and is called by
  the extension server on every refresh, with the result shipped via
  `client$set_system_prompt(...)`.
- `summarise_board()` — a token-budgeted text summary of the current
  board (blocks, links, stacks), formatted for LLM consumption.
  Internally walks each entity via the new `summarise_block` /
  `summarise_stack` S3 generics so block / stack authors can override
  the per-entity line for their class (parallel to the Phase 2
  `describe_block` / `describe_stack` pattern).
- `format_tool_catalogue()` — derives the “you have these tools” section
  from `client$get_tools()` instead of hand-curated text in the prompt
  body. Reflects whatever was registered, including user extensions.
- A `last_flush_error` `reactiveVal` populated by Phase 3’s
  `flush_pending` on dispatch-time validator rejection. Surfaces in the
  prompt as a one-line “your previous changes were rejected because X”
  note, then clears once consumed.
- A new `query_data(code)` read tool: evaluates model-supplied R against
  an environment built from
  [`blockr.core::eval_env()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_server.html)
  with every committed block’s result bound by id, captures stdout + the
  return value via `capture.output`, returns the captured text. The
  escape hatch for questions the static board summary can’t cover
  (unique values, group counts, ad-hoc filters, cross-block joins)
  without bloating the prompt context with per-block result previews.
- One showcase example app under `inst/examples/populated-board/`
  exercising a populated board, mutation tools, and the new prompt
  context.
- `vignettes/intro.Rmd` — the user-facing top-level tutorial. Lives next
  to the existing design vignettes but at the package root so pkgdown
  surfaces it as the “Get started” article.
- An updated `README.Rmd` reflecting the full feature set.
- `_pkgdown.yml` organisation: a “Get started” article, a “Design notes”
  section grouping the phase docs, and a reference index grouped by
  surface (extension, tools, S3 generics).
- Tests for `default_system_prompt` and the flush-feedback round-trip.

Out (deferred to later phases or out of roadmap):

- New mutation tools. The Phase 4 surface is final for the initial
  roadmap. (One new *read* tool — `query_data` — lands in this phase;
  see scope above.)
- A `list_pending_changes()` tool. Phase 4 left it as a follow-up if
  empirical use shows the model is confused by committed-only reads
  during a turn. Phase 5’s compact board summary covers the read side of
  the same friction; we’ll decide on the pending-list tool based on
  actual usage rather than speculatively.
- A “pending changes” UI affordance (badge, diff preview). The
  reactiveVals from Phase 3 are still observable; bolting on a UI is
  cheap, but no user has asked for it yet.
- Per-block-type custom tools (#12, \#13).
- Snapshot / undo. Still gated on `blockr.session` hooks that do not
  exist.
- Multi-board / multi-session orchestration.
- Cross-session conversation persistence wiring. Phase 1 made it
  round-trip-capable; the wiring layer (e.g. `blockr.session`
  integration) is unchanged here.
- Inline tool-call approval UI. Phase 4’s mutation tools dispatch via
  the staging layer at turn end; a “review before apply” gate is a
  future affordance, not a Phase 5 deliverable.

## Architectural decisions

### Why dynamic context at all

Every prior phase landed on the same finding: a static system prompt
combined with on-demand tool calls covers the “what is on the board”
question but at noticeable token and latency cost. Concretely, the
two-turn pattern observed during Phase 4 manual testing —

> User: “what blocks are there?” Model: `→ list_blocks()` Model: “There
> are three blocks: data, head, plot.”

…costs one round-trip per trivial question, and the same `list_blocks`
result is re-fetched every turn the model wants to reason about board
shape. Folding a compact board summary into the system prompt removes
the round-trip for the easy questions and gives the model a coherent
mental model entering every turn. The expensive tools (`describe_block`,
`get_block_result`) stay where they are — drill-down on demand — but the
*shape* of the board is permanently in context.

Three observations from Phase 4 push the same direction:

1.  **The model already discovers the tool surface by calling each tool
    once and reading its description.** That’s wasteful when we can ship
    the catalogue in the prompt directly. ellmer exposes the registered
    tools via `client$get_tools()`, so generating the catalogue is a
    structural projection of existing data — no hand-maintained list to
    drift.
2.  **Flush-time rejections are invisible to the model.** Phase 3
    shipped this as a known limitation. With mutation tools live, the
    model can confidently report “I added a block” and have the dispatch
    reject for a reason the user can see in a Shiny toast but the model
    cannot. Surfacing a one-line “your previous turn was rejected” note
    on the next turn lets the model recover without the user retyping
    the error.
3.  **ID-change requests need a system-prompt nudge.** Phase 4’s
    architectural decision on immutable committed ids is correct, but
    the model has no way to know that without trying and failing. A
    short note in the intro block (“committed ids are immutable; offer
    `remove + add` if the user asks to rename”) is cheaper than a failed
    tool call.

### The system prompt is a function, with a string shorthand

Phase 1’s `system_prompt = "<full prompt string>"` argument was the
right shape for a static prompt, but Phase 5 wants the prompt to reflect
the live board state on every new turn. We resolve this by extending the
argument’s type rather than splitting it: the `system_prompt` argument
now accepts a *function* (called each turn to build the prompt) or a
*string* (used verbatim as a static prompt). The default is the function
`default_system_prompt`, which ships the four-section composition
(intro + tool catalogue + board summary + optional flush-rejection
note).

``` r

new_assistant_extension(system_prompt = default_system_prompt, ...)
```

The semantics:

- Default (or any function): called on every refresh with
  `(board, client, last_flush)`. The function decides what the prompt
  looks like — the package’s `default_system_prompt` does the
  four-section composition, but a caller can write any function with the
  same signature.
- String: wrapped internally as `function(...) the_string` so the
  refresh path is branch-free. A user opting into a static string takes
  full control: no auto-appended catalogue, no auto-appended board
  summary, no refresh activity. The deal is “give up dynamic context,
  gain full prompt control”.

The user-extending-the-default pattern stays clean:

``` r

my_prompt <- function(board, client, last_flush, ...) {
  paste(
    "EXTRA: prefer modify_block over remove + add when possible.",
    "",
    default_system_prompt(board, client, last_flush),
    sep = "\n"
  )
}

new_assistant_extension(system_prompt = my_prompt)
```

The signature is `(board, client, last_flush, ...)`. The positional args
are reactives the extension server holds; the `...` is
forward-compatibility headroom. The default `default_system_prompt`
accepts the same shape, and the recommendation for user-supplied
functions is the same: accept `...` so that adding an arg to the call
site in a future phase (e.g. `pending` if same-turn read-after-write
ever lands; sibling-extension context if the `assistant_tools` axis ever
lands — see \#4) doesn’t break custom functions written today.

The `state` shape changes only by collapse: when `system_prompt` is a
function (custom or default), the `state` payload omits the key entirely
so blockr.dock’s `do.call(ctor, payload)` falls back to the default on
restore. When it’s a string, the literal string is stored. Phase 4 saved
boards that stored a literal string still restore cleanly under Phase
5’s wrapped-string path.

``` r

state_payload <- list(messages = messages)

if (is.character(system_prompt)) {
  state_payload$system_prompt <- system_prompt
}

list(state = state_payload)
```

Custom *functions* do not round-trip — same fundamental limitation as
any function-valued argument under ser/des, since closure environments
don’t serialise robustly. A caller passing a custom `system_prompt`
function must re-pass it on every mount. This is documented in *Known
limitations* below.

### Composition cadence: drive refresh from materialized state

The composed prompt should track two things: the live board (so the
model sees current state) and the previous turn’s flush outcome (so the
model sees the rejection note). Both signals are reactive values the
extension already has access to, so refresh is driven by observation
rather than scheduled at hook points:

``` r

observe({
  board$board               # any successful materialization
  last_flush_error()        # rejection-note signal
  refresh_prompt()
})
```

`board$board` is the post-validation post-apply value held in
`blockr.core`’s board `reactiveValues`. It changes only after the
priority-`-Inf` applier observer runs against an `update(...)` payload
that passed the priority-`Inf` validator. So reading it reactively gives
us a free “the update materialized” event: validation failures don’t
change it (no refresh on those), and the materialization timing is what
we wanted.

This single observer covers every refresh trigger we care about:

| Scenario | Trigger | Effect on the prompt |
|----|----|----|
| Model’s own flush succeeds | `board$board` changes | Refresh; next turn’s prompt sees the new board |
| Model’s own flush rejects | `last_flush_error()` changes | Refresh; next turn’s prompt carries the delta note |
| User edits the board between turns | `board$board` changes | Refresh; next turn’s prompt sees the edit |
| User edits the board mid-turn | `board$board` changes | Refresh fires immediately; the *next* LLM request in the tool-call loop reads the updated prompt (the in-flight request is already on the wire and can’t be amended without cancelling) |
| Read-only turn, no UI edit | nothing changes | No refresh; prior prompt is still accurate |

The `last_input` observer keeps `reset_pending` and `record_new_turns`
but no longer calls `refresh_prompt` — the board observer covers what
last_input used to cover, and adds the mid-turn case. The `last_turn`
observer keeps `flush_pending` and `record_new_turns`; the prompt
refresh follows from `flush_pending`’s reactiveVal writes, not from the
observer’s body.

The in-flight stream caveat: `ellmer::Chat$set_system_prompt` mutates
`private$.turns` on the R6 chat object — subsequent reads (next request
in the tool-call loop, next user turn) see the update. The
currently-streaming request body was already sent and can’t be amended;
whatever is mid-flight finishes against the prompt it started with.
Cancelling the stream on every UI edit would be strictly worse — UI
edits unrelated to the current exchange would burn turns.

Ordering of reactive writes inside the last_turn observer:
`flush_pending` writes `last_flush_error` (set or clear) before
returning. The board observer doesn’t fire until the next reactive flush
after the current observer body finishes, so the refresh sees the *new*
value of `last_flush_error` (and the *new* value of `board$board` if the
flush succeeded).

### Section structure of the default prompt

`default_system_prompt` assembles four sections in a fixed order. Order
is fixed because token-cache hits on Anthropic’s API and equivalent
behaviour on others rely on prefix stability — sections that change
infrequently come first.

1.  **Intro / conventions** (rarely changes). The free-text introduction
    plus the conventions that don’t auto-generate (staging semantics,
    committed-only inspection reads, id immutability, the `modify_block`
    boundary). Inlined in the default function body; a caller writing
    their own `system_prompt` function controls this section entirely.
2.  **Tool catalogue** (changes only if tools are registered or removed
    — effectively never within a session). One line per tool:
    `<name>(<args>): <description>`. Generated from `client$get_tools()`
    by walking `arguments@properties` of each `ToolDef` and emitting a
    compact signature. Description is the `description` field, trimmed
    and de-newlined to one line.
3.  **Board summary** (changes whenever `board$board` materializes a
    change). The current shape of the board: a one-line header
    (`N blocks, M links, K stacks`), then per-block / per-link /
    per-stack lines (see *Board summary content* below). Empty boards
    emit the header plus an explicit “(no blocks yet)” note rather than
    three empty tables. The summary always reflects the *committed*
    board (consistent with Phase 4’s committed-only read-tool surface).
4.  **Delta note** (one-shot, when `last_flush_error` is non-NULL).
    `"Note: your previous turn's changes were rejected: <reason>. The board did not change."`.
    Cleared by the next successful or no-op flush.

Sections are joined with blank-line separators. Each non-empty section
has a one-line header (`## Board:`, `## Tools:`, …) so the model can
navigate the prompt without parsing.

### Board summary content and token budget

The summary is structured to surface what the model needs to plan a
mutation without forcing it to call `describe_block` for every block.
The per-entity projections are delivered through two new S3 generics so
block / stack authors can override per class:

- **Per block** — `summarise_block(x, board, id)`. Default for the base
  `block` class returns one line:
  `<id> (<class>): <arg=val, ...> [modifiable: <keys>]`. The args come
  from `initial_block_state(x)`; modifiable keys from the
  `external_ctrl` attribute (resolved the same way
  `describe_block.block` does). The modifiable-keys field is the key
  extra over Phase 4’s read tools: it lets the model pick `modify_block`
  vs `remove + add` without a `describe_block` round-trip — exactly the
  round-trip elimination Phase 5 exists to deliver. *Not* included: the
  block’s evaluated result (that’s `get_block_result`’s job — too large
  for prompt context), display name + source package (registry metadata,
  looked up by the model via `list_available_blocks` when it actually
  needs to add a block).
- **Per link** — flat row from
  [`board_links()`](https://bristolmyerssquibb.github.io/blockr.core/reference/board_blocks.html):
  `<id>: <from> -> <to>$<input>`. No generic; links are not subclassable
  in blockr.core’s current API.
- **Per stack** — `summarise_stack(x)`. Default for the base `stack`
  class returns the existing `describe_stack`-shape projection (name +
  comma-separated blocks); the internal `summarise_stacks` helper
  prepends the id. Stack classes that add attributes
  (e.g. `blockr.dag::dag_stack` with a colour) override their class for
  a denser one-line representation.

`summarise_block` and `summarise_stack` slot in alongside the existing
`describe_block` / `describe_stack` (Phase 2) and `summarise_result`
(Phase 2). Three generics, three aspects of how a block reaches the
model — `describe_*` is the full drill-down projection used by the read
tool, `summarise_*` is the compact prompt-context projection used by the
dynamic system prompt, and `summarise_result` is the result-value
projection used by `get_block_result`. Block authors can override any
subset.

A soft cap of ~4000 characters total for the board section keeps the
prompt sub-1k-tokens on a moderately busy board (the intro + tool
catalogue is bounded at ~1500 chars by the count and shape of our
tools). If the board exceeds the cap, we truncate per-block arg values
more aggressively and fall back to a header-only summary (“Board has 47
blocks; call list_blocks to see them all.”) for boards that would
otherwise blow the budget. Models with larger context windows will
rarely hit the cap; the truncation is a safety belt, not the steady
state.

We deliberately do not surface `get_block_result` previews in the prompt
summary. The result is the most expensive thing to format, the most
volatile (changes every re-evaluation), and the most likely to be
irrelevant to the next user turn. The model already has
`get_block_result` for the cases where it cares; preempting it would
waste tokens on every turn for occasional value.

### Tool catalogue auto-generation

The Phase 1 / Phase 2 default prompt hard-coded the tool names. With
nine mutation tools (Phase 4) plus six read tools (Phase 2), plus the
possibility of user-registered tools, the hand-curated list is both long
and a maintenance hazard. `default_system_prompt` derives it from
`client$get_tools()`:

``` r

format_tool_catalogue <- function(client) {

  tools <- client$get_tools()

  if (!length(tools)) {
    return("No tools registered.")
  }

  lines <- chr_ply(tools, function(t) {
    sig <- format_tool_signature(t)
    desc <- gsub("\\s+", " ", t@description)
    sprintf("- `%s`: %s", sig, desc)
  })

  paste(lines, collapse = "\n")
}
```

`format_tool_signature` walks `tool@arguments@properties` (ellmer wraps
the arg list inside a `TypeObject` whose `@properties` slot holds the
per-argument `TypeBasic` entries) and produces `name(arg1, arg2, ...)`,
marking optional arguments (`@required` is `FALSE`) with `?` and
required ones bare. `client$get_tools()` returns tools in registration
order, so the catalogue is stable across runs — a useful property for
prompt-cache hit rates on providers that key on prefix bytes.

A consequence: if the model encounters a tool not in the catalogue, that
means the tool was registered after the last `last_input` refresh. Phase
5 ships with no late-registration mechanism, so the case is
hypothetical. If a future phase adds dynamic tool registration
(e.g. per-block-type custom tools — \#12), the catalogue will need a
refresh on tool-set change too.

### Flush-rejection feedback as a one-shot delta note

Phase 4’s `flush_pending` already wraps the `update(...)` dispatch in a
`tryCatch` and emits a `warning(...)` on rejection. Phase 5 extends it
with an optional `last_flush_error` reactiveVal so the outcome of the
dispatch can be surfaced to the model on the next turn. The arg is
optional so existing test callers
(`flush_pending(pending_update, update)` in
`tests/testthat/test-extension.R`) keep working unchanged.

``` r

flush_pending <- function(pending, update, last_flush_error = NULL) {

  payload <- isolate(pending())

  if (!has_any_changes(payload)) {
    reset_pending(pending)
    if (!is.null(last_flush_error)) last_flush_error(NULL)
    return(invisible(FALSE))
  }

  tryCatch(
    {
      update(payload)
      if (!is.null(last_flush_error)) last_flush_error(NULL)
    },
    error = function(e) {
      if (!is.null(last_flush_error)) {
        last_flush_error(conditionMessage(e))
      }
      warning(
        "flush_pending: dispatch rejected payload: ",
        conditionMessage(e),
        call. = FALSE
      )
    },
    finally = reset_pending(pending)
  )

  invisible(TRUE)
}
```

The `last_flush_error` reactiveVal sits in the extension server scope
alongside `pending_update`. It is *not* part of `state` — like pending,
it’s transient turn-local scratch, not contractual surface.

The clearing on the no-op branch is important: without it, a rejection
from turn N would survive past turn N+1 if N+1 happened to be a
no-mutation turn (e.g. the user asks a question rather than issuing a
follow-up edit), and the stale note would show up in N+2’s prompt. The
invariant we want is “the delta note always reflects the most recent
flush attempt”; clearing on no-op preserves it.

`default_system_prompt` reads the reactiveVal on every refresh and emits
the note when non-NULL; the full implementation lives in the sketch
below.

### Default-prompt content

The Phase 4 `default_system_prompt` body splits under Phase 5:

- The static prose — staging semantics, committed-only inspection reads,
  id immutability, the `modify_block` / `remove + add` boundary, “answer
  concisely” — is inlined as the first section of
  `default_system_prompt`’s output.
- The per-tool listing drops out entirely: the auto-generated catalogue
  replaces it. So does the JSON-args-as-string note, which already lives
  in the `add_block` / `modify_block` tool descriptions and reaches the
  model via the catalogue.

### Defensive error handling around the `system_prompt` call

The function bound to `system_prompt` runs once per refresh, on every
materialized board change. A failure path needs to exist for both the
package default (a bug in `summarise_board` or
`format(<exotic-block-class>)`) and user-supplied functions (arbitrary
code).

The wrap is a `tryCatch` inside `refresh_prompt` that:

- surfaces the failure to the user via
  `blockr.core::notify(..., type = "error")`, which renders a Shiny
  toast *and* logs at error level — same path Phase 4’s mutation tools
  and Phase 3’s flush rejection use, so a failure here has the same
  diagnostic footprint as any other assistant-side error,
- skips the `set_system_prompt` call on failure (the chat client keeps
  its previous prompt — least-surprising fallback; matches how Shiny’s
  own observer error handling leaves prior reactive values in place),
- does *not* substitute a different prompt (e.g.
  `default_system_prompt`) — silently swapping the prompt contents would
  hide what the caller actually asked for.

If the very first refresh fails (initial mount, no previous prompt to
fall back to), the chat client retains the empty placeholder passed to
`chat_ctor` at construction time. The model would then operate without
any board context until the next refresh succeeds. That is a package bug
if the default is at fault, and a caller bug if a custom function is at
fault — the error notification points at the root cause either way.

### `query_data`: an eval escape hatch for richer inspection

`get_block_result` returns a fixed
[`summarise_result()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/summarise_result.md)
projection of a single block — useful for “what does this look like” but
inadequate for “how many distinct values of `Species` are there”,
“what’s the mean of column X grouped by Y”, “do rows from block A and
block B match on id”. A static prompt can’t carry every such projection,
and inflating the per-block summary to cover them would burn tokens on
every turn for occasional value.

The remedy: a `query_data(code)` read tool that evaluates model-supplied
R against a scoping env built from
[`blockr.core::eval_env()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_server.html)
with every committed block’s result bound under its id. Captures stdout
(any `print`s the code does) and auto-prints the last expression’s value
via `capture.output`. Returns the captured text (truncated to a line cap
so a runaway `print(huge_df)` doesn’t blow the budget).

Behavioural shape mirrors a one-shot R REPL evaluation:

- Bindings: every block `b` with a successful result is bound as `b` in
  the env. Blocks that errored at evaluation time are omitted, and the
  tool result lists them in a one-line preface so the model knows what
  wasn’t reachable.
- Parent env:
  [`eval_env()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_server.html)’s
  default chain — either `default_eval_parent()` (blockr-default
  packages attached) or
  [`baseenv()`](https://rdrr.io/r/base/environment.html), depending on
  the `attach_default_packages` blockr_option. Matches how a block’s own
  expression evaluates, so the model’s mental model of “what’s in scope”
  lines up with what a `mutate_block` (or similar) would see.
- Output:
  `capture.output({ val <- eval(parsed, envir = env); print(val) })`.
  Mid-script `print` calls land in the capture; the last expression’s
  value auto-prints (REPL semantics). Errors at parse or eval time route
  through `with_tool_errors` into the standard
  `query_data failed: <reason>` envelope.
- Truncation: hard cap at ~200 lines of captured output. Over the cap,
  the tool result is the first N lines + a
  `(output truncated; %d lines hidden)` footer.

Security and trust: this lets the model execute arbitrary R in the app’s
process. That sounds alarming until you notice the mutate-block class of
attack surface is already reachable —
`add_block("mutate_block", args = '{"expr": "system(...)"}')` gets the
same code execution via the staging path. `query_data` doesn’t expand
the attack surface, it just makes the same capability explicit and
ergonomic for read-only inspection. Anyone deploying the assistant in a
high-trust context (i.e. real user data, real R session) already needs
to vet the model provider and the data sources for prompt-injection
risk; adding `query_data` doesn’t change that calculus.

What the tool is *not*: sandboxed (no callr subprocess, no allowlist),
time-limited (no timeout — long-running queries block the chat module),
memory-bounded (large intermediate values stay in the eval env until
GC). All of these are hardening passes a future phase can layer on
without changing the tool’s surface.

### What `default_system_prompt` is *not*

A few deliberate non-features:

- **No few-shot examples.** Tempting on a green-field assistant, but
  expensive in tokens and prone to over-fitting the model to the example
  shape. The tool descriptions and the board summary are enough; if user
  feedback shows the model misuses a tool, we improve that tool’s
  description rather than ship a few-shot exemplar.
- **No interception of the in-flight stream.** Mid-turn UI edits refresh
  the prompt, but the request currently on the wire finishes against its
  original prompt. The model’s *next* request in the tool-call loop sees
  the update.
- **No conversation summarisation / compression.** ellmer handles
  context-window management at the provider boundary. We do not
  re-summarise old turns; we only manipulate the system prompt.
- **No diff vs. last turn’s summary.** “Block X changed since you last
  looked” would be useful but introduces stateful comparison
  bookkeeping. The flush-rejection note covers the
  “previous-turn-mattered” case; further diffing waits on demand.

## Implementation sketch

### `R/system-prompt.R` (extended)

``` r

#' Default assistant system prompt
#'
#' Builds the four-section system prompt the assistant ships by
#' default: an intro / conventions block, an auto-generated tool
#' catalogue from `client$get_tools()`, a compact board summary,
#' and (when applicable) a one-line note carrying the previous
#' turn's flush rejection.
#'
#' Each argument is optional; the corresponding section is omitted
#' when its input is `NULL`, so `default_system_prompt()` at the
#' REPL returns just the intro block — useful for inspecting what
#' the default looks like without mounting a board.
#'
#' This is the default value of `new_assistant_extension`'s
#' `system_prompt` argument. Custom functions passed in its place
#' receive `(board, client, last_flush, ...)`; the `...` is
#' forward-compatibility headroom for future phases adding inputs
#' (accept `...` in custom functions so the call site can grow
#' without breaking you).
#'
#' @param board Reactive containing the live board, as supplied to
#'   the extension server. `NULL` omits the board section.
#' @param client An `ellmer::Chat`. `NULL` omits the tool catalogue.
#' @param last_flush Reactive holding the previous turn's flush
#'   rejection message (character) or `NULL`. `NULL` (or a `NULL`
#'   value) omits the delta note.
#' @param ... Forward-compatibility slot for future inputs.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function(board = NULL, client = NULL,
                                  last_flush = NULL, ...) {

  intro <- paste(
    "You are an assistant embedded next to a blockr data analysis",
    "board. The Tools section below lists what you can call; the",
    "Board section is the current shape of the board.",
    "",
    "Inspection tools always read the committed board, not your",
    "staged changes. Mutation tools *stage* a change; nothing",
    "applies mid-turn. All staged calls from your turn flush as one",
    "atomic update when your turn ends. Your own tool-call history",
    "is the record of what is pending.",
    "",
    "Block, link and stack ids are immutable once committed. If the",
    "user asks to rename one, explain you can offer remove + add",
    "with a new id, but that tears down the block server and",
    "re-evaluates downstream blocks -- ask before proceeding. For",
    "a still-staged entity, use remove + add to change the id.",
    "",
    "modify_block can only change keys reported as modifiable in",
    "the Board section above (and block_name, always). For other",
    "changes use remove_block + add_block.",
    "",
    "Answer concisely.",
    sep = "\n"
  )

  sections <- intro

  if (!is.null(client)) {
    sections <- c(
      sections, "", "## Tools", format_tool_catalogue(client)
    )
  }

  if (!is.null(board)) {
    sections <- c(
      sections, "", "## Board", summarise_board(board)
    )
  }

  err <- if (!is.null(last_flush)) isolate(last_flush()) else NULL

  if (!is.null(err)) {
    sections <- c(
      sections,
      "",
      sprintf(
        "Note: your previous turn's changes were rejected: %s. %s",
        err,
        "The board did not change. Re-issue corrected calls."
      )
    )
  }

  paste(sections, collapse = "\n")
}

format_tool_catalogue <- function(client) {

  tools <- client$get_tools()

  if (!length(tools)) {
    return("(none)")
  }

  lines <- chr_ply(tools, function(t) {
    sprintf(
      "- `%s`: %s",
      format_tool_signature(t),
      gsub("\\s+", " ", t@description)
    )
  })

  paste(lines, collapse = "\n")
}

format_tool_signature <- function(tool) {

  args <- tool@arguments@properties

  if (!length(args)) {
    return(sprintf("%s()", tool@name))
  }

  parts <- chr_ply(names(args), function(nm) {
    if (isTRUE(args[[nm]]@required)) nm else paste0(nm, "?")
  })

  sprintf("%s(%s)", tool@name, paste(parts, collapse = ", "))
}

summarise_board <- function(board, max_chars = 4000L) {

  b <- isolate(board$board)
  blks <- board_blocks(b)
  lnks <- board_links(b)
  stks <- board_stacks(b)

  # board_links() returns a vctrs record (links class); length()
  # gives row count, nrow() returns NULL. Same shape as the value
  # describe_block.block subsets with `links[links$to == id]`.
  header <- sprintf(
    "%d block(s), %d link(s), %d stack(s).",
    length(blks), length(lnks), length(stks)
  )

  if (!length(blks) && !length(lnks) && !length(stks)) {
    return(paste(header, "(empty board -- no blocks yet)"))
  }

  body <- c(
    header,
    "",
    summarise_blocks(blks),
    summarise_links(lnks),
    summarise_stacks(stks)
  )

  out <- paste(body, collapse = "\n")

  if (nchar(out) > max_chars) {
    return(
      paste(
        header,
        "(too many blocks to inline; call list_blocks for the full",
        "list)"
      )
    )
  }

  out
}

summarise_blocks <- function(blks) {

  if (!length(blks)) return(character())

  c(
    "## Blocks",
    chr_ply(names(blks), function(id) {
      summarise_block(blks[[id]], board = NULL, id = id)
    })
  )
}

summarise_links <- function(lnks) {

  if (!length(lnks)) return(character())

  df <- as.data.frame(lnks)
  c(
    "## Links",
    chr_ply(
      seq_len(nrow(df)),
      function(i) sprintf(
        "- %s: %s -> %s$%s",
        df$id[[i]], df$from[[i]], df$to[[i]], df$input[[i]]
      )
    )
  )
}

summarise_stacks <- function(stks) {

  if (!length(stks)) return(character())

  c(
    "## Stacks",
    chr_ply(names(stks), function(id) {
      sprintf("- %s %s", id, summarise_stack(stks[[id]]))
    })
  )
}
```

### `R/summarise-block.R` *(new)*

``` r

#' Summarise a block for the LLM prompt context
#'
#' Generic backing the per-block lines in the dynamic system
#' prompt's board summary. The default method `summarise_block.block`
#' produces a compact one-line summary (id, class, current arg
#' values, modifiable keys). Block authors override their class
#' when the default is too generic or too verbose for prompt
#' context.
#'
#' Parallel to [describe_block()] (which produces the *full*
#' multi-line description used by the `describe_block` tool). Use
#' `summarise_block` when token density matters; use
#' `describe_block` when the user has explicitly asked for detail.
#'
#' @param x A `block`.
#' @param board The current board snapshot, for resolving
#'   cross-references. May be `NULL` — currently unused by the
#'   default method, reserved for overrides that want to surface
#'   relationships.
#' @param id The id under which the block lives on the board.
#' @param ... For future use.
#'
#' @return A single-line character scalar (preferred). A multi-line
#'   vector is accepted but inflates the prompt budget.
#'
#' @export
summarise_block <- function(x, board, id, ...) UseMethod("summarise_block")

#' @rdname summarise_block
#' @export
summarise_block.block <- function(x, board, id, ...) {

  args <- initial_block_state(x)
  ctrl <- attr(x, "external_ctrl")

  args_str <- if (length(args)) {

    paste(
      chr_ply(names(args), function(nm) {
        sprintf("%s=%s", nm, format(args[[nm]]))
      }),
      collapse = ", "
    )

  } else {
    "no args"
  }

  ctrl_str <- if (isTRUE(ctrl)) {
    "all args + block_name"
  } else if (isFALSE(ctrl) || !length(ctrl)) {
    "block_name only"
  } else {
    paste(c(ctrl, "block_name"), collapse = ", ")
  }

  sprintf(
    "- %s (%s): %s [modifiable: %s]",
    id, class(x)[[1L]], args_str, ctrl_str
  )
}
```

### `R/summarise-stack.R` *(new)*

``` r

#' Summarise a stack for the LLM prompt context
#'
#' Generic backing the per-stack lines in the dynamic system
#' prompt's board summary. The default method `summarise_stack.stack`
#' produces a compact name + member-blocks line. Stack classes that
#' carry extra attributes (e.g. `blockr.dag::dag_stack` with a
#' colour) override their class to surface those attributes.
#'
#' Parallel to [describe_stack()] (full description, used by the
#' `list_stacks` tool's description column). Use `summarise_stack`
#' when token density matters.
#'
#' @param x A `stack`.
#' @param ... For future use.
#'
#' @return A single-line character scalar (preferred). The caller
#'   in `summarise_board()` prepends the stack's id.
#'
#' @export
summarise_stack <- function(x, ...) UseMethod("summarise_stack")

#' @rdname summarise_stack
#' @export
summarise_stack.stack <- function(x, ...) {

  blocks <- stack_blocks(x)
  blocks_str <- if (length(blocks)) {
    paste(blocks, collapse = ", ")
  } else {
    "<empty>"
  }

  sprintf(
    "'%s' (blocks: %s)",
    coal(stack_name(x), "<unnamed>"),
    blocks_str
  )
}
```

### `R/tool-query-data.R` *(new)*

``` r

tool_query_data <- function(board, update, session) {

  ellmer::tool(
    function(code) {
      with_tool_errors("query_data", {

        blks <- isolate(board$blocks)

        data <- list()
        skipped <- character()

        for (id in names(blks)) {

          res <- tryCatch(
            isolate(blks[[id]]$server$result()),
            error = function(e) e
          )

          if (inherits(res, "error")) {
            skipped <- c(skipped, id)
          } else {
            data[[id]] <- res
          }
        }

        env <- eval_env(data)
        parsed <- parse(text = code)

        output <- capture.output({
          val <- NULL
          for (e in parsed) val <- eval(e, envir = env)
          if (!is.null(val)) print(val)
        })

        if (length(output) > 200L) {
          hidden <- length(output) - 200L
          output <- c(
            output[seq_len(200L)],
            sprintf("(output truncated; %d lines hidden)", hidden)
          )
        }

        if (length(skipped)) {
          output <- c(
            sprintf(
              "(skipped blocks with errors: %s)",
              paste(skipped, collapse = ", ")
            ),
            "",
            output
          )
        }

        paste(output, collapse = "\n")
      })
    },
    name        = "query_data",
    description = paste(
      "Evaluate R code against the board's block results. Every",
      "committed block's evaluated result is bound in scope by its",
      "block id (e.g. for a block with id `data` write `head(data)`).",
      "Returns captured stdout plus the auto-printed value of the",
      "last expression -- the same shape an R REPL would produce.",
      "Use this for questions the Board section doesn't carry: unique",
      "values, group counts, ad-hoc filters, joins across blocks.",
      "Read-only; the board is not modified."
    ),
    arguments = list(
      code = ellmer::type_string(
        paste(
          "R code to evaluate. Multiple statements allowed; the last",
          "expression's value is auto-printed."
        )
      )
    )
  )
}
```

`register_read_tools` gains one line registering the tool alongside the
Phase 2 read surface.

### `R/extension.R` (diff)

``` r

new_assistant_extension <- function(system_prompt = default_system_prompt,
                                    messages = NULL,
                                    ...) {

  new_dock_extension(
    server = asst_ext_srv(system_prompt, messages),
    ui     = asst_ext_ui,
    name   = "Assistant",
    class  = "assistant_extension",
    options = new_board_options(new_llm_model_option()),
    ...
  )
}

asst_ext_srv <- function(system_prompt, messages) {

  function(id, board, update, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        chat_ctor <- isolate(
          get_board_option_value("llm_model", session)
        )

        # Normalise: a string becomes a function returning that
        # string, so refresh_prompt() has no branching. force()
        # captures the string by value before the closure forms.
        compose <- if (is.function(system_prompt)) {
          system_prompt
        } else {
          force(system_prompt)
          function(...) system_prompt
        }

        pending_update   <- reactiveVal(empty_pending())
        last_flush_error <- reactiveVal(NULL)

        # Ctor needs an initial system prompt; pass a placeholder
        # and overwrite it after tools are registered so the
        # catalogue covers the full set on first composition.
        client <- chat_ctor(system_prompt = "")

        register_read_tools(client, board, update, session)
        register_mutation_tools(
          client, board, pending_update, session
        )

        refresh_prompt <- function() {

          prompt <- tryCatch(
            compose(board, client, last_flush_error),
            error = function(e) {
              notify(
                paste(
                  "Assistant prompt update failed:",
                  conditionMessage(e)
                ),
                type = "error"
              )
              NULL
            }
          )

          if (!is.null(prompt)) {
            client$set_system_prompt(prompt)
          }
        }

        refresh_prompt()                                          # initial

        if (length(messages)) {
          client$set_turns(
            lapply(messages, ellmer::contents_replay)
          )
        }

        mod <- shinychat::chat_mod_server("chat", client)

        messages <- reactiveVal(coal(messages, list()))

        record_new_turns <- function() {
          # unchanged from Phase 3
        }

        # Single observer for prompt refresh; fires on any materialized
        # board change or any change to the flush-rejection signal.
        observe({
          board$board
          last_flush_error()
          refresh_prompt()
        })

        observeEvent(
          mod$last_input(),
          {
            reset_pending(pending_update)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        observeEvent(
          mod$last_turn(),
          {
            flush_pending(pending_update, update, last_flush_error)
            record_new_turns()
          },
          ignoreNULL = TRUE
        )

        output$tokens <- renderUI(
          format_token_telemetry(mod$last_turn())
        )

        state_payload <- list(messages = messages)
        if (is.character(system_prompt)) {
          state_payload$system_prompt <- system_prompt
        }

        list(state = state_payload)
      }
    )
  }
}
```

Four diffs vs. Phase 4:

1.  Constructor’s `system_prompt` default flips from `NULL` to the
    exported `default_system_prompt` function. Strings continue to work
    — they’re wrapped at server start into a function that returns the
    string. No rename, no new arg.
2.  New `last_flush_error` reactiveVal alongside `pending_update`.
    `flush_pending` gains a third (optional) argument; existing callers
    passing two args keep working.
3.  New `observe({ board$board; last_flush_error(); refresh_prompt() })`
    block drives refresh from materialized state changes, covering both
    between-turn UI edits and mid-turn UI edits (the latter picked up by
    the next request in the tool-call loop). The explicit initial
    `refresh_prompt()` after tool registration sets the prompt before
    the observer settles for the first time — deterministic startup
    state.
4.  The `last_input` observer drops its prompt-refresh call (the board
    observer covers it) but keeps `reset_pending` and
    `record_new_turns`.

The `state` shape now conditionally includes `system_prompt`: only when
the caller passed a literal string. Function-valued `system_prompt`
(custom function or the default) is omitted from state so
`do.call(ctor, payload)` on restore falls back to the constructor’s
default. Phase 4 saved boards carry a literal string in
`state$system_prompt` (Phase 4 always serialised the resolved default
text); those still restore cleanly under Phase 5’s wrapped-string path.

### `R/staging.R` (diff)

``` r

flush_pending <- function(pending, update, last_flush_error = NULL) {

  payload <- isolate(pending())

  if (!has_any_changes(payload)) {
    reset_pending(pending)
    if (!is.null(last_flush_error)) last_flush_error(NULL)
    return(invisible(FALSE))
  }

  tryCatch(
    {
      update(payload)
      if (!is.null(last_flush_error)) last_flush_error(NULL)
    },
    error = function(e) {
      if (!is.null(last_flush_error)) {
        last_flush_error(conditionMessage(e))
      }
      warning(
        "flush_pending: dispatch rejected payload: ",
        conditionMessage(e),
        call. = FALSE
      )
    },
    finally = reset_pending(pending)
  )

  invisible(TRUE)
}
```

Two changes vs. Phase 4’s `flush_pending`:

- Optional `last_flush_error` arg. Existing tests calling
  `flush_pending(pending_update, update)` keep working — the feedback
  path is no-op when the arg is `NULL`.
- The reactiveVal write is symmetric across all three branches (no-op /
  success / rejection). The no-op branch clears the prior error so a
  flush-rejected turn followed by a no-mutation turn doesn’t leave a
  stale note visible on turn +2. The invariant `default_system_prompt`
  relies on is *“the delta note always reflects the most recent flush
  attempt”*.

Phase 3’s atomicity contract is otherwise unchanged: the whole staged
payload either applies or is discarded; no partial apply.

## Documentation deliverables

### Top-level tutorial vignette — `vignettes/intro.Rmd`

Lives at the package root (not under `vignettes/design/`) so
`browseVignettes("blockr.assistant")` and pkgdown’s “Get started” slot
pick it up. The design-doc vignettes stay under `vignettes/design/` as
articles, accessed via the pkgdown navbar.

Outline (one Rmd, ~250 lines):

1.  *What this is.* Two sentences plus a screenshot of a populated board
    with the assistant panel.
2.  *Mount it on a board.* Copy-paste runnable example: a `dock_board`
    with three blocks, the assistant extension, served.
3.  *Talk to it.* A worked dialogue showing the model answering “what
    blocks are on the board?” (now answered from the prompt summary, no
    tool call), then “describe the head block” (one tool call), then
    “add a scatter plot of sepal length vs sepal width” (three staged
    mutations, one flush).
4.  *Configure the model.* How to point at a different provider via
    `blockr_option("chat_function", …)`. Pointer to ellmer for the
    provider matrix.
5.  *Customise the prompt.* Pass a string for full static control, or a
    function for full dynamic control (wrapping
    [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
    is the usual extension pattern).
6.  *Extend the prompt and read tools.* The S3 generic family exposed by
    the package: `describe_block` / `describe_stack` (full descriptions,
    used by the read tools), `summarise_block` / `summarise_stack`
    (compact prompt-context lines), and `summarise_result` (block result
    formatting). One short example each for a bespoke block class
    overriding `summarise_block` and `describe_block` to demonstrate the
    density / detail split.
7.  *Where to go next.* Pointers to the design vignettes for
    contributors, and the issue tracker for feature requests.

Code chunks are not evaluated (`eval = FALSE`) — the package can’t talk
to a live model in CI without a key. Screenshots ship under
`man/figures/`.

### Example apps — `inst/examples/`

Two demos, named for what they show rather than for which phase
introduced them:

- `empty-board/` — empty board, assistant builds it from scratch.
  Smoke-tests the mutation surface end-to-end against a real LLM.
- `populated-board/` — a four-block pipeline (`data` → `filter` → `head`
  / `plot`) with two stacks, wired before the assistant mounts. Gives
  the model something to navigate to (not just from). Comments at the
  top list manual scenarios (“ask what’s on the board without calling a
  tool”, “rename a block to observe the immutability nudge”, “ask ‘how
  many unique species in `data`?’ to exercise `query_data`”).

Phase 5 consolidates the per-phase example directories (`01-shell/`,
`02-read-tools/`) into `populated-board/` and renames
`04-mutation-tools/` → `empty-board/`. The single phase-5 showcase
becomes `populated-board/`.

### README — `README.Rmd`

A surgical edit, not a rewrite. The existing README is mostly fine —
badges, install, the runnable example with `data + head + plot`, and the
screenshot all still apply. The only stale piece is the “Roadmap”
section that pins the lifecycle at Phase 1 and says “the assistant … has
no tools to inspect or manipulate the board yet”. Replace it with a
one-paragraph status pointer:

> The assistant is feature-complete for the initial roadmap. See the
> [roadmap
> article](https://bristolmyerssquibb.github.io/blockr.assistant/articles/design/...)
> for the staged plan and per-phase design notes.

Lifecycle badge stays `experimental` (still pre-1.0). The example
screenshot may be refreshed from the Phase 5 example app, but that’s a
`man/figures/` swap, not a README change.

### pkgdown — `_pkgdown.yml`

Two changes:

1.  *Articles navbar*: a “Get started” entry pointing at
    `vignettes/intro.Rmd`, and a “Design notes” section that surfaces
    the six design vignettes in roadmap order.
2.  *Reference index*: grouped into “Extension”
    (`new_assistant_extension`, `default_system_prompt`), “S3 generics”
    (`describe_block`, `describe_stack`, `summarise_block`,
    `summarise_stack`, `summarise_result`), and an unlabelled miscellany
    for anything that does not fit (currently empty — the package
    surface is intentionally small).

The pkgdown site is already deployed via the existing CI workflow; no
infra changes.

## Files added / changed

- `R/system-prompt.R` — rewrite `default_system_prompt` from a zero-arg
  static-string function to the four-section builder documented above
  (signature `(board = NULL, client = NULL, last_flush = NULL, ...)`).
  Add the internal helpers: `format_tool_catalogue`,
  `format_tool_signature`, `summarise_board`, `summarise_blocks`,
  `summarise_links`, `summarise_stacks`. The intro / conventions text is
  inlined in the function body (no separate helper).
- `R/summarise-block.R` *(new)* — `summarise_block` S3 generic + default
  `summarise_block.block` method emitting the compact per-block line.
- `R/summarise-stack.R` *(new)* — `summarise_stack` S3 generic + default
  `summarise_stack.stack` method emitting the compact per-stack line.
- `R/tool-query-data.R` *(new)* — `tool_query_data` factory; the
  read-eval-print escape hatch documented above.
- `R/tools-read.R` — register `tool_query_data` in `register_read_tools`
  alongside the Phase 2 read tools. `system_prompt` from `NULL` to
  `default_system_prompt`, accept function or string, wrap strings as
  `function(...) the_string` at server start, add `last_flush_error`
  reactiveVal, add the `refresh_prompt()` helper and its `last_input`
  call site, and switch `state` to conditionally include `system_prompt`
  only when it is a literal string.
- `R/staging.R` — extend `flush_pending` with the optional
  `last_flush_error` reactiveVal write (success and no-op clear,
  rejection populates).
- `inst/examples/populated-board/app.R` *(new)* — showcase demo.
- `vignettes/intro.Rmd` *(new)* — user-facing tutorial.
- `README.Rmd` / `README.md` — rewrite per the section above.
- `_pkgdown.yml` — reference index grouping; “Get started” article.
- `tests/testthat/test-system-prompt.R` *(new)* —
  `default_system_prompt` and formatter coverage:
  [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  (no args) returns the intro block; with `client` adds the catalogue;
  with `board` adds the summary; with a populated `last_flush`
  reactiveVal adds the delta note. `format_tool_signature` shape.
  `summarise_board` on empty / small / oversized boards.
- `tests/testthat/test-extension.R` — update the existing
  `default_system_prompt` no-arg test to assert the intro-only return
  when called bare. Replace existing
  `asst_ext_srv(system_prompt = NULL, ...)` callers with explicit
  function-valued args (`default_system_prompt` or a stub), since the
  new server no longer coalesces NULL to default. Add tests for the
  string-arg path (state carries the string verbatim, the refresh sets
  that string each turn), the function-arg path (state omits
  `system_prompt` so restore falls back to default), the
  `observe({ board$board; last_flush_error() })` refresh observer
  wiring, and the flush-feedback round-trip (rejected dispatch populates
  `last_flush_error`, refresh surfaces the note, successful follow-up
  flush clears it).
- `tests/testthat/test-staging.R` — extend `flush_pending` tests with
  the optional `last_flush_error` reactiveVal behaviour (success clears,
  rejection populates, no-op also clears so a stale error can’t survive
  a quiet turn).
- `vignettes/design/0-roadmap.Rmd` — fix the stale `<n>-<topic>.qmd`
  references (10 occurrences) to `.Rmd` to reflect PR \#7’s conversion,
  and add the Phase 5 entry to the vignette index table. Pure docs
  drift; no code impact.
- `NEWS.md` *(new if absent)* — `system_prompt` argument now accepts a
  function (the new default `default_system_prompt`), flush-rejection
  feedback, pkgdown article reorganisation.
- `DESCRIPTION` — bump version to `0.1.0` reflecting initial roadmap
  completion. No new imports — `client$get_tools()`,
  `client$set_system_prompt()`, and
  [`eval_env()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_server.html)
  are existing ellmer / blockr.core surface.

New exports: rewritten `default_system_prompt` (same name as Phase 4,
signature change only), `summarise_block`, `summarise_stack`. All other
helpers are internal.

## Acceptance criteria

### Automated (CI / `devtools::check()`)

- [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  called with no arguments returns just the intro block (no `## Tools`,
  no `## Board`, no delta note); with a `client` adds the catalogue
  header and tool lines; with a `board` adds the board header and
  per-entity lines; with a populated `last_flush` reactiveVal adds the
  delta note.
- `format_tool_catalogue()` against a chat with the full Phase 2 + Phase
  4 tool set emits one line per tool in registration order, with
  optional args marked `?` and required args bare.
- `summarise_board()` against:
  - An empty board → header + “(empty board – no blocks yet)”.
  - A small populated board → header + per-block / per-link / per-stack
    lines.
  - A pathologically large board (1000 synthetic blocks) → header +
    “(too many blocks to inline; call list_blocks…)” truncation branch.
- `summarise_block` dispatches per class: register a fake S3 method
  `summarise_block.fake_class` returning `"OVERRIDDEN"`, build a board
  containing a block of that class, assert the `summarise_board()`
  output for that block is `"OVERRIDDEN"` (and the default-class blocks
  are unchanged).
- `summarise_stack` dispatches per class: same shape as the block test,
  against a fake stack class.
- `query_data` happy path: against a board with a `dataset_block` named
  `d` serving `iris`, calling the tool with `code = "nrow(d)"` returns
  `"[1] 150"`. With `code = "length(unique(d$Species))"` returns
  `"[1] 3"`. With multiple statements (`"x <- table(d$Species); x"`)
  returns the auto-printed table.
- `query_data` error paths: parse error in `code` returns a
  `"query_data failed: <reason>"` string (via `with_tool_errors`);
  runtime error in `eval` returns the same envelope; a board with a
  failing block surfaces a `"(skipped blocks with errors: …)"` preface
  and the other blocks still resolve in scope.
- `query_data` truncation: a `code` argument that auto-prints a
  10000-row data frame produces output capped at 200 lines plus a
  `(output truncated; N lines hidden)` footer.
- Refresh observer fires on board materialization: stage and flush a
  non-empty payload via
  [`shiny::testServer()`](https://rdrr.io/pkg/shiny/man/testServer.html),
  assert `client$get_system_prompt()` reflects the new board after the
  flush (refreshed by the `board$board` observer, not by a `last_input`
  hook).
- Refresh observer fires on UI-driven board change: directly mutate
  `board$board` (simulating a UI edit), assert
  `client$get_system_prompt()` reflects the new state without any
  `last_input` / `last_turn` activity in between.
- Failing `system_prompt` function: pass
  `system_prompt = function(...) stop("boom")`. Trigger a refresh.
  Assert (a) `client$get_system_prompt()` is unchanged from the previous
  value, (b) a notification of type `"error"` was emitted (mock
  [`blockr.core::notify`](https://bristolmyerssquibb.github.io/blockr.core/reference/get_session.html),
  capture the call), (c) the chat module is still alive — no observer
  crash.
- Flush-rejection round-trip via
  [`shiny::testServer()`](https://rdrr.io/pkg/shiny/man/testServer.html):
  - Stage a payload that fails a mocked validator. Trigger `last_turn`.
    Assert `last_flush_error()` holds the rejection message and
    `client$get_system_prompt()` contains the delta note (refresh fires
    off the `last_flush_error` observation).
  - Trigger `last_turn` after a no-op turn. Assert `last_flush_error()`
    is `NULL` and the composed prompt no longer carries the note.
- String-arg path: passing `system_prompt = "<custom>"` to
  `new_assistant_extension` results in `client$get_system_prompt()`
  returning exactly `"<custom>"` after the initial refresh, and the
  `state` payload carries `system_prompt = "<custom>"` verbatim.
- Function-arg path: passing `system_prompt = function(...) "X"` results
  in `client$get_system_prompt()` returning `"X"`, and the `state`
  payload omits the `system_prompt` key entirely.
- The `state` round-trip: serialising an extension built with a custom
  string, restoring it, and reading `client$get_system_prompt()` returns
  the same string. Built with the default function, the restored
  extension uses the default function again (not a stale snapshot).
- Phase 1-4 acceptance criteria continue to pass.
- `devtools::check()` passes 0/0/0.
- [`lintr::lint_package()`](https://lintr.r-lib.org/reference/lint.html)
  passes 0 lints.

### Manual (demo app, live LLM)

Run the Phase 5 example app against a real provider and verify:

- *Trivial question without a tool call.* “How many blocks are on the
  board?” Expected: the model answers from the prompt summary without
  invoking `list_blocks`. Inspect ellmer’s turn record to confirm no
  tool call fired.
- *Drill-down with a tool call.* “Show me the current value of `n_rows`
  on the head block.” Expected: one `describe_block` call, accurate
  answer.
- *`query_data` drill-down.* “How many unique values of `Species` does
  the `data` block carry, and what are they?” Expected: one `query_data`
  call (e.g. `unique(data$Species)`), answer cites the three
  setosa/versicolor/virginica values from the captured output. Confirms
  the eval escape hatch is being used for questions the static summary
  can’t answer.
- *Pipeline build.* “Add a filter for `Sepal.Width > 3` after the head
  block and pipe the result into a new scatter plot.” Expected: the
  model stages the appropriate blocks and links in one turn; the flush
  succeeds; the new blocks appear on the board.
- *Rename request.* “Rename `head` to `top_rows`.” Expected: the model
  declines the in-place rename, explains the `remove + add` path with
  the eval-state caveat, and asks the user. (Triggered by the
  id-immutability paragraph in the default prompt’s intro; no tool call
  required.)
- *Recover from a flush rejection.* Set up a board where a staged link
  would create a cycle (manual setup via the example app’s comments).
  Ask the assistant to add the cycle-creating link. Expected: the model
  reports staging success per tool call, then the flush rejects; on the
  next user prompt (“try again differently”), the model sees the delta
  note in its prompt and proposes a non-cyclic alternative without the
  user having to paste the error.
- *Mid-turn UI edit.* While the assistant is busy on a multi-tool-call
  turn (e.g. “build a small pipeline”), edit a block’s args via the UI
  (change the dataset selection on a dataset block, say). Expected: the
  *currently-streaming* LLM request finishes against its original
  prompt, but the next request in the same turn’s tool-call loop sees
  the updated board summary. Inspect by asking the model on a follow-up
  turn whether it noticed the edit; it should reference the new args
  without a fresh tool call.

Manual checks are documentation, not gating — they verify the
prompt-context layer holds up in a real assistant loop and are recorded
in the PR description.

## Known limitations carried into later phases

- **Mid-turn UI edits can’t reach the in-flight LLM request.** Prompt
  refresh is driven by an observer on `board$board`, so any successfully
  materialized board change — including a UI edit while the assistant is
  working — triggers a fresh `client$set_system_prompt(...)`. Subsequent
  requests in the tool-call loop pick the update up. The
  currently-streaming request body, however, is already on the wire and
  finishes against the prompt it started with. Cancelling the stream on
  every UI edit would be strictly worse (any unrelated edit kills the
  model’s in-flight reply), so we accept this gap.
- **No diff against last turn’s summary.** “Block X’s `n_rows` changed
  since you last looked” would help the model spot user edits, but
  introduces stateful comparison bookkeeping. The flush-rejection note
  is the only delta we ship; richer diffs wait on demand.
- **Tool catalogue is bag-of-tools, not categorised.** The catalogue
  lists every registered tool in registration order. For the current
  16-tool surface this is readable; if per-block-type custom tools (#12)
  ever land, grouping by namespace might matter.
- **`query_data` runs unsandboxed in-process.** Model-supplied code
  reaches `default_eval_parent()` (or
  [`baseenv()`](https://rdrr.io/r/base/environment.html)), same scope as
  a `mutate_block` expression. No timeout, no memory cap, no
  [`system()`](https://rdrr.io/r/base/system.html) allowlist. The
  architectural decision section above argues this is acceptable because
  the same attack surface exists via `add_block("mutate_block", ...)`; a
  future hardening phase can layer subprocess isolation (callr),
  expression allowlists, or time/memory limits without changing the
  tool’s surface.
- **Static-string override loses dynamic context.** Passing
  `system_prompt = "<string>"` opts out of refresh entirely. A caller
  who wants the default composition plus a small extra line writes their
  own function that calls `default_system_prompt(...)` and concatenates
  — the extension has no “default + append” sugar. Adding sugar is cheap
  if real use shows it matters.
- **No prompt-cache awareness.** `default_system_prompt` assembles
  sections in a stable order so providers that cache on prefix bytes
  (e.g. Anthropic’s prompt caching) get decent hit rates, but we don’t
  surface explicit cache breakpoint hints. ellmer may grow this API; we
  wire it up if/when it appears.
- **`list_pending_changes()` deferred.** Phase 4 left the door open for
  an explicit “show me what’s staged” tool if empirical use showed the
  model getting confused. Phase 5’s compact board summary covers the
  read side of the same friction; we’ll observe and add the tool only if
  real users hit it.
- **No conversation persistence wiring.** Inherited from Phase 1. The
  `state` payload (`system_prompt` when a string, `messages` always)
  round-trips via `blockr.dock`’s ser/des, but cross-session
  save/restore (e.g. via `blockr.session`) is still application-level
  integration.
- **No snapshot / undo.** Inherited from the roadmap.
- **No inline tool-call approval UI.** Inherited from Phase 4. Mutation
  tools dispatch via staging at turn end; a “review before apply” gate
  is a future affordance.
- **Custom-function `system_prompt` does not round-trip via ser/des.**
  Function values are deliberately omitted from the `state` payload, so
  a board saved with a custom function reloads using the default
  function. Functions don’t serialise robustly (closure environments
  carry application-specific bindings), and the alternative — silently
  freezing the rendered string at save time — would be more surprising
  than reverting to default. Callers who need a custom function
  re-supply it at mount time each session.
