# Roadmap

## Vision

`blockr.assistant` is a
[`blockr.dock`](https://github.com/BristolMyersSquibb/blockr.dock)
extension that puts a chat interface next to a `blockr` board. The chat
is driven by [`ellmer`](https://ellmer.tidyverse.org/) and equipped with
a set of *tools* — R functions exposed to the LLM — that allow a model
to inspect and manipulate board state. Tool invocations are translated
into the same `update(...)` reactive payloads that interactive user
actions use, so the assistant is, from the board’s perspective, just
another caller of the public extension API.

The intended user experience is conversational pipeline construction:

> “Load the `iris` dataset, then drop the species column, then plot
> sepal length vs. width.”

…producing the corresponding blocks, links and stack on the board.

## Scope

In scope:

- A `dock_extension` providing a chat panel.
- Provider-neutral chat construction by consuming the board’s
  [`new_llm_model_option()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_board_options.html).
- LLM tools for CRUD operations on blocks, links and stacks.
- Block-parameter editing via `blockr.core`’s external-control mechanism
  (`external_ctrl = TRUE` blocks).
- Streamed responses and tool-call telemetry via
  [`shinychat`](https://posit-dev.github.io/shinychat/).

Explicitly out of scope (for now):

- Building our own LLM provider abstractions — `ellmer` handles that.
- Application-level persistence wiring. The extension’s constructor and
  `state` shape make system prompt and chat history round-trip through
  `blockr.dock`’s standard ser/des (see Phase 1), but the integration
  that triggers cross-session save/restore (e.g. via `blockr.session`)
  is out of the initial roadmap.
- Mutation safeguards (undo, dry-run, snapshot-before-mutation) — the
  initial implementation applies tool calls directly to the board.
  Snapshotting will likely be revisited once `blockr.session` exposes
  the right hooks.
- Multi-board / multi-session reasoning — assistant context is scoped to
  the single board it is mounted on.

## Architecture sketch

            ┌──────────────────────────────────────────────────────────────┐
            │                       dock_board                             │
            │                                                              │
            │   ┌────────────────────┐     ┌────────────────────────────┐  │
            │   │   board state      │ ←── │    assistant_extension     │  │
            │   │   (blocks, links,  │     │                            │  │
            │   │    stacks)         │     │  ┌──────────────────────┐  │  │
            │   │                    │     │  │   chat panel (UI)    │  │  │
            │   │   update reactive  │ ←── │  │   shinychat module   │  │  │
            │   └────────────────────┘     │  └──────────┬───────────┘  │  │
            │           ↑                  │             │              │  │
            │           │                  │  ┌──────────┴───────────┐  │  │
            │           │                  │  │  ellmer::Chat with   │  │  │
            │           │                  │  │  registered tools    │  │  │
            │           │                  │  │  ┌──────────────┐    │  │  │
            │           └──────────────────┼──┤  │ board tools  │    │  │  │
            │                              │  │  │ (CRUD)       │    │  │  │
            │                              │  │  └──────────────┘    │  │  │
            │                              │  └──────────────────────┘  │  │
            │                              └────────────────────────────┘  │
            └──────────────────────────────────────────────────────────────┘

Concretely:

- [`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md)
  returns a `dock_extension` whose UI is a
  [`shinychat::chat_mod_ui()`](https://posit-dev.github.io/shinychat/r/reference/chat_app.html)
  panel and whose server constructs an
  [`ellmer::Chat`](https://ellmer.tidyverse.org/reference/Chat.html)
  from the board’s `llm_model` option, registers the tool layer over
  closures of `(board, update, session)`, and hands the chat to
  [`shinychat::chat_mod_server()`](https://posit-dev.github.io/shinychat/r/reference/chat_app.html).
- Each tool is an R closure that captures the live `board` and `update`
  references. Inspection tools read from `board$board`. Mutation tools
  emit `update(list(blocks = …, links = …, stacks = …))` payloads, or
  write to externally-controlled block reactives.
- The chat’s system prompt is composed from a fixed assistant persona
  plus a dynamically generated board summary (block IDs, types, links,
  stacks, available block constructors).

## Architectural decisions

Two decisions shape every phase below and deserve to be stated up front:

**Provider neutrality via
[`new_llm_model_option()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_board_options.html).**
We never construct an `ellmer` chat client directly. The board exposes
an `llm_model` board option whose value is a chat-constructor function
of signature `function(system_prompt = NULL, params = NULL)` returning
an [`ellmer::Chat`](https://ellmer.tidyverse.org/reference/Chat.html).
The extension reads that option and calls it. Providers, model names and
keys are configured globally via `blockr_option("chat_function", …)` —
out of scope for this package. The option always resolves to a usable
function (falling back to `blockr.core`’s `default_chat`), so the
extension never needs to handle a missing chat backend.

**Narrow tools, auto-batched dispatch.** The LLM sees many small,
focused tools (`add_block`, `add_link`, …) rather than one monolithic
`modify_board`. Each tool call does **not** dispatch an `update(...)`
immediately; it *stages* its change into a pending payload held inside
the extension server. Validation runs against the current board merged
with the pending payload, so per-tool feedback is meaningful. When the
assistant’s turn completes, the accumulated payload is flushed as a
single `update(...)` call.

This combination gives us:

- LLM-friendly tool ergonomics (small, focused calls, easy to describe).
- A single atomic dispatch per user turn (one validation pass, one
  re-render, one logical snapshot point for future `blockr.session`
  integration).
- The “add link before block” ordering trap disappears within a turn —
  ordering of stage operations is irrelevant as long as the final
  payload is valid.

The staging layer is the central architectural deliverable of the
package; every mutation tool is a thin façade over it.

## Decomposition into phases

Each phase corresponds to its own design doc under `vignettes/design/`,
named `<n>-<topic>.Rmd`. These files are deliberately excluded from the
package tarball via `.Rbuildignore` — they are not installed vignettes
(R CMD check rejects digit-prefixed vignette filenames) but `pkgdown`
walks `vignettes/` recursively and picks them up as articles served at
`articles/design/<n>-<topic>.html`. Phases are ordered so that the
package compiles and demos something at the end of each one.

### Phase 1 — Extension shell with `ellmer` chat

*File:* `1-shell.Rmd`

[`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md)
constructor, dock UI/server, a
[`shinychat::chat_mod_ui`](https://posit-dev.github.io/shinychat/r/reference/chat_app.html)
/ `chat_mod_server` panel, and an
[`ellmer::Chat`](https://ellmer.tidyverse.org/reference/Chat.html)
constructed from the board’s `llm_model` option. Includes from day one:

- Streaming responses, history, basic token telemetry.
- A visible “stop” affordance — provided for free by
  [`shinychat::chat_mod_server()`](https://posit-dev.github.io/shinychat/r/reference/chat_app.html),
  which constructs an
  [`ellmer::stream_controller()`](https://ellmer.tidyverse.org/reference/stream_controller.html)
  internally and wires its own cancel input. No work for us beyond
  verifying it end-to-end.
- A default, overridable assistant persona shipped with the package —
  configurable via a `system_prompt` argument on
  [`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md).
  The default persona is short and scoped to “you are a blockr board
  assistant”; subsequent phases add dynamic board context on top.
- A `state` shape that round-trips constructor arguments
  (`system_prompt`, `messages`) via `blockr.dock`’s ser/des. Constructor
  signature ↔︎ state keys is a structural contract (see `1-shell.Rmd` for
  the implications). Phase 1 also adds a `messages = NULL` constructor
  argument so that a saved conversation can be seeded back into the chat
  on restore. Model parameters (temperature, max tokens, …) are
  deliberately *not* in the extension’s surface — they belong to the
  chat constructor, supplied via `blockr_option("chat_function", …)` or
  the board’s `llm_model` option.

No tools yet — the assistant can hold a conversation but is board-blind.

### Phase 2 — Read-only tool layer

*File:* `2-read-tools.Rmd`

Establish the “tool kit” abstraction: closures over
`(board, update, session)`, JSON-schema argument definitions via
`ellmer::type_*`, and result shaping (strings, structured lists,
errors). Implement the read-only inspection tools:

- `list_blocks`, `describe_block`
- `list_links`, `list_stacks`
- `list_available_block_types`
- `get_block_result_preview`

This phase locks in the patterns later mutation phases follow.

### Phase 3 — Staging and dispatch model

*File:* `3-staging.Rmd`

The architectural keystone. No new LLM-facing tools, but a clean
foundation for Phase 4.

- A pending-update `reactiveVal` private to the extension server.
- A “merge current board + pending payload” helper for tools to validate
  against.
- A turn-completion hook that flushes the pending payload via
  `update(...)` and resets it.
- Error formatting for tool results (so the model can self-correct).
- Behaviour on flush failure (partial rollback, error to user, error to
  model).

### Phase 4 — Mutation tools

*File:* `4-mutation-tools.Rmd`

All thin façades over the Phase 3 staging layer:

- Blocks: `add_block(type, args)`, `remove_block(id)`,
  `modify_block(id, args)` (via `external_ctrl` reactives).
- Links: `add_link(from, to, input)`, `remove_link(id)`.
- Stacks: `add_stack(blocks, name)`, `remove_stack(id)`,
  `modify_stack(id, blocks, name)`.

Design decisions to nail down here: ID generation policy, validation of
constructor args before staging, behaviour when external control is not
available on a `modify_block` target, link validity checks (referenced
blocks exist, target input exists, no cycles).

### Phase 5 — Context, examples and polish

*File:* `5-polish.Rmd`

- Dynamic board-summary in the system prompt (refreshed each turn).
- Model-facing error formatting and recovery hints.
- Example apps in `inst/examples/`.
- A top-level tutorial vignette `intro.Rmd`.
- README, `pkgdown` site setup.

No new features beyond polish on the context layer.

### Splitting Phase 4 if it grows

If Phase 4 turns out larger than expected, the natural split is *block
mutation* vs. *link + stack mutation*. Blocks carry the bulk of the
complexity (external control, registry lookup, ID generation); links and
stacks are mechanical once the block patterns are in place. This is
cheap to do retroactively — the design doc cleaves at that boundary.

## Future work (out of the initial roadmap)

These are flagged so we don’t lose them, but they are explicitly **not**
phases of the initial roadmap:

- **Snapshot / undo** — integrate with `blockr.session` to snapshot
  board state before each mutation and expose an undo tool to the LLM.
  Requires hooks in `blockr.session` that don’t yet exist.
- **Conversation persistence wiring** — Phase 1 already ships the state
  shape and constructor surface needed for chat history to round-trip
  via ser/des. What’s missing is the integration that actually triggers
  save/restore — either through `blockr.session` or via
  `shinychat::chat_mod_server(bookmark_on_*)`.
- **Per-block-type tool registration** — allow block packages to
  contribute tools specific to their blocks (e.g. a `blockr.dplyr` block
  exposing a `set_filter_expression` tool).
- **Multi-agent / multi-tool-call orchestration** — explicit support for
  long-running plans, tool-call retries, structured planning.
- **UI affordances for tool calls** — inline “approve this change” UI in
  the chat, surfacing tool diffs to the user before they apply.

## Vignette index

| Phase | File                   | Topic                                  |
|------:|------------------------|----------------------------------------|
|     0 | `0-roadmap.Rmd`        | This document                          |
|     1 | `1-shell.Rmd`          | Extension shell with `ellmer` chat     |
|     2 | `2-read-tools.Rmd`     | Read-only tool layer                   |
|     3 | `3-staging.Rmd`        | Staging & dispatch model               |
|     4 | `4-mutation-tools.Rmd` | Mutation tools (blocks, links, stacks) |
|     5 | `5-polish.Rmd`         | Context, examples, polish              |
