# blockr.assistant (development version)

* The post-apply review the assistant sends itself now includes a
  short result summary of each block the turn touched -- the added or
  modified blocks, plus the destination of any added or removed link
  -- so the model can catch a block that built but is silently wrong
  (e.g. a filter that yields no rows), not only one that errors. The
  touched set is read off core's normalised board update, reusing the
  link-removal expansion `preprocess_board_update()` already performs
  rather than recomputing it. The summary is capped at ten blocks with
  a pointer to `get_block_result` / `query_data` for the rest, and the
  review invites the model to inspect downstream results when a change
  is likely to propagate. The per-turn auto-correction bound is raised
  from two to three. Fixes #43.

* `add_block` now rejects constructor arguments outside a block's
  documented set (the names `list_available_blocks` reports), turning
  the silent argument-swallow of a constructor `...` into an error the
  model can act on. `list_available_blocks` gains an `inputs` column
  naming each block's input slots, so links are wired to real slot
  names rather than invented ones. JSON arguments that are arrays of
  objects (a filter's `conditions`, a summarize's `summaries`) are now
  kept as lists of records rather than collapsed into a data frame the
  block state cannot consume.

* `set_board_option` now passes the board to blockr.core's
  `set_board_option_value()`, adopting the required-`board` signature
  introduced in BMS/blockr.core#229 so the write honours the board's
  own lock policy rather than bypassing it. Fixes #52.

* After the assistant applies its staged changes at turn end, it now
  reports the outcome back to the model so it can correct a problem it
  introduced without waiting for the user to notice a red block. Two
  failure channels are surfaced: a board update the model triggered
  that was rejected or failed to apply (`board$last_update`, from
  BMS/blockr.core#200), and blocks that begin raising errors or
  warnings once the change re-evaluates. The latter come from the
  board-level `board$conditions` reactive added in BMS/blockr.core#218:
  the assistant snapshots it at the start of the user's turn and, once
  the post-apply re-evaluation settles, reports the conditions that
  appeared since (a set-difference keyed on core's condition id). When
  something is found it injects a short follow-up turn, bounded per
  user turn so a stubborn problem cannot loop. The `get_block_conditions`
  read tool and the per-block health markers in the board summary now
  read the same `board$conditions` source, replacing the package's own
  condition flattener. Fixes #29.

* Adds an LLM tool surface for board options: `list_board_options`
  reports each option's id, category, current value and default, and
  `set_board_option` sets a value, coercing it through the option's
  own transform. Unlike block / link / stack mutations, option values
  are session-scoped rather than part of the board-update payload, so
  `set_board_option` writes immediately via blockr.core's
  `set_board_option_value()` instead of staging into the turn-end
  flush. The `llm_model` option is excluded from the setter, since
  changing it rebuilds the assistant's own chat client. The board
  summary gains an Options section listing the option surface.

* The board summary in the dynamic system prompt now renders each
  entity through blockr.core's `str_value()` generic (and the
  `str_value` methods blockr.dock supplies for its classes), instead
  of the assistant-owned `summarise_*` S3 generics. Those had a single
  method each, dispatching on classes owned by packages *below* this
  one, so they could never be extended downstream; they are now plain
  internal helpers that call `str_value()`. Each entity's compact
  rendering is owned by its home package -- the correct extension point
  and dependency direction -- so a stack's colour now appears
  automatically. The per-block line reports the externally-controllable
  constructor inputs (marked `*`) rather than frozen initial argument
  values, which also removes the old
  `blockr.core:::initial_block_state()` workaround. `describe_block`
  still reports modifiable keys, now via the exported
  `external_ctrl_vars()` rather than the raw `external_ctrl` attribute
  (#20).

* Adds an LLM tool surface for view CRUD and layout mutations: six
  new tools (`list_views`, `add_view`, `remove_view`, `modify_view`,
  `set_active_view`, `rename_view`) backed by an extended staging
  payload that grows a `views = list(add, mod, rm, active)` slot
  alongside the existing `blocks` / `links` / `stacks` slots. The
  staged delta flushes atomically via the same `update()` channel
  used by interactive actions, composing across slots in a single
  lifecycle tick.

* Layouts move over the wire as the JSON spec form owned by
  blockr.dock: the tools parse and render with dock's exported
  `layout_from_json()` / `layout_to_json()` / `layout_panel_ids()`,
  presenting bare block / extension IDs (dock resolves them to
  canonical panel IDs on flush). The default system prompt picks up a
  Layout subsection documenting the shape and a Views section in the
  board summary (one line per view: name, active marker, panel
  count). `rename_view` is synthesised from add + rm + active
  carry-over to avoid an extra payload slot; the upstream dock
  receiver is free to add a native `rename` later.

* Requires the dock `views` payload slot from BMS/blockr.dock#150
  plus the `augment_board_update()` / `apply_board_update()` generics
  from BMS/blockr.core#185 (relaxed `validate_board_update_structure()`
  so subclass-defined payload slots pass through to subclass
  methods). Fixes #18.

# blockr.assistant 0.1.0

Feature-complete close-out of the initial roadmap (Phases 1-5).
The biggest changes since the Phase 4 cut:

* The `system_prompt` argument of `new_assistant_extension()` now
  accepts a function (called each refresh with `(board, client,
  last_flush, ...)`) or a string (used verbatim as a static prompt
  with no refresh). The default is the new exported function
  `default_system_prompt`, which composes a four-section prompt:
  an intro / conventions block, an auto-generated tool catalogue
  from `client$get_tools()`, a compact board summary, and (when
  applicable) a one-line flush-rejection note. The prompt is
  refreshed on every materialized board change via an observer on
  `board$board`, so the model always sees the current state of the
  board -- including the user's UI edits between turns (and
  follow-up requests in a multi-tool-call turn).

* Two new exported S3 generics, `summarise_block(x, board, id)`
  and `summarise_stack(x)`, drive the per-entity lines in the
  board summary. Block / stack authors override per class to
  customise how their classes appear in prompt context. Mirrors
  the existing `describe_block` / `describe_stack` pair (full
  descriptions surfaced by the read tools); `summarise_*` is the
  compact projection used by the live prompt, `describe_*` is the
  drill-down used on demand.

* New `query_data` read tool: evaluates model-supplied R against
  an environment built from `blockr.core::eval_env()` with every
  committed block's result bound by id, captures stdout plus the
  auto-printed value of the last expression, and returns the
  captured text (truncated at 200 lines). The escape hatch for
  questions the static board summary can't carry: unique values,
  group counts, ad-hoc filters, cross-block joins.

* `flush_pending()` gains an optional `last_flush_error`
  reactiveVal argument. On dispatch-time validator rejection it
  captures the message; on success or no-op it clears. The dynamic
  prompt reads it via the composer's `last_flush` arg and emits a
  one-line "your previous turn's changes were rejected" note so
  the model can recover without the user retyping the error.

* Tutorial vignette at the package root
  (`vignette("blockr.assistant")`), surfaced by pkgdown as the
  Get-Started article. Showcase demo at
  `inst/examples/05-polish/`. The `_pkgdown.yml` reference index
  groups the surface into "Extension" and "S3 generics".

# blockr.assistant 0.0.0.9000

Initial development version (Phases 1-4): extension shell with
ellmer chat, read-only tool layer, staging & dispatch model,
mutation tools.
