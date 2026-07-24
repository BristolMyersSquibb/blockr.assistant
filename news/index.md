# Changelog

## blockr.assistant (development version)

- The system-prompt board summary is now bounded by a character budget,
  so a large board no longer inflates every request. Each section
  (blocks, links, stacks, options, views, extensions) is trimmed
  independently to `blockr.assistant_board_section_max_chars` (default
  1500), each pointing at its own listing tool – so a long block list
  can no longer crowd out a later section such as the extensions –
  replacing the previous all-or-nothing fallback that dropped the whole
  summary at once. Fixes \#58.

- The system prompt’s board summary now lists the board’s dock
  extensions – each one’s name, its externally controllable variables,
  and the self-description it supplies. The model thus sees an
  extension’s own guidance on how to drive it directly in the prompt –
  for instance a workflow diagram’s advice to move a block via its
  position handle rather than the panel tools – instead of having to
  call `list_extensions` first.
  [`describe_board()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_board.md)
  is a new generic backing the summary, with a `dock_board` method
  adding the view and extension sections. Fixes \#59.

- The assistant reads the live board layout from blockr.dock’s
  `view_data` reactive rather than the committed board, so `list_views`
  and the system prompt’s view summary reflect UI-driven panel
  rearrangements immediately. Both fall back to the committed board
  until every view has reported its layout. Fixes \#60.

- `resize_panel(view, panel, size)` sets a panel’s group `size` (a ratio
  in (0, 1)) along its splitview axis, staging blockr.dock’s `resize`
  panel-op verb. `add_panel_to_view()` gains a matching optional `size`
  to record a panel’s target size as it is added. Fixes \#69.

- The assistant now applies its staged changes through an explicit
  `commit` tool that returns the touched blocks’ results as its own tool
  result, in-band. The model can stage a unit of work, commit, read what
  it built and correct it – all within one turn – instead of the review
  arriving as a synthetic user message on the next turn.
  Staged-but-uncommitted changes at turn end are still applied as a
  backstop, with a nudge to commit. Fixes \#73.

- `focus_panel(view, panel)` brings a panel already in a view to the
  front of its tab group and focuses it, switching to that view if it
  isn’t the active one. It stages blockr.dock’s `select` panel-op verb –
  the last one no assistant tool emitted – so the view-edit surface now
  covers add / remove / move / focus. Use it to surface a specific block
  or extension, e.g. one the assistant just added or evaluated. Fixes
  \#71.

- Editing an existing view is now done with atomic panel-op tools –
  `add_panel_to_view()`, `remove_panel_from_view()` and `move_panel()` –
  that map one-to-one onto blockr.dock’s panel operations, each carrying
  optional `near` / `side` placement hints (`within` / `left` / `right`
  / `above` / `below`). They replace `modify_view()`, whose whole-layout
  JSON was both awkward for a model to edit and carried geometry that
  dock’s membership-only view validation now rejects. Each call stages
  one verb into the pending update, and a turn’s edits on a view compose
  into a single atomic update at flush. Fixes \#64.

- The view-layout tools track blockr.dock’s restructured layout API, in
  which a view carries panel *membership* and a separate `dock_grid`
  carries the *arrangement* – dock’s bare `dock_layout()` constructor
  and `layout_from_json()` are gone. `add_view` still seeds a new view’s
  arrangement from the layout you pass, and `list_views` /
  `validate_layout` speak the same compact JSON spec as before, now
  parsed into a `dock_grid`. Changing which panels an existing view
  holds is a membership edit, with the live arrangement staying dock’s
  to own (its settled-echo grid mirror is the sole grid writer).
  Restores a clean install and `R CMD check` against blockr.dock `main`.
  Fixes \#65.

- `list_available_blocks` now surfaces the block construction metadata
  blockr.core formalised in BMS/blockr.core#121. It gains a `guidance`
  column (model-facing construction notes) and an `examples` column
  (complete worked configurations keyed by argument name), and its
  `arguments` column now maps each argument to its description and
  machine-readable JSON-Schema `type` descriptor
  ([`arg_string()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_arg_spec.html),
  [`arg_enum()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_arg_spec.html),
  …) rather than a bare description string – so an argument’s allowed
  values and shape reach the model, not just prose. All of it is read
  through core’s new
  [`block_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_metadata.html)
  / `block_arg_*()` accessors. Previously the `examples` / `prompt`
  attributes the registry carried were dropped before the model ever saw
  them, so the assistant had neither a worked example nor construction
  guidance when configuring a block; `add_block` now points the model at
  both. The deprecated
  [`registry_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/register_block.html)
  calls are replaced by
  [`block_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_metadata.html)
  and
  [`block_meta_arguments()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_metadata.html).
  Fixes \#54.

- The post-apply review now reports each touched block together with its
  immediate neighbours – the blocks feeding it and the blocks it feeds –
  not just the block itself. A block wired to a column or element that
  is not in its input – the usual cause of an empty or errored panel –
  previously left the model to guess the fix from the error alone; it
  now also sees the input’s own result (and the consumers, to confirm
  the change propagated), so it can correct the reference or loosen an
  over-strict filter on its next turn instead of leaving the user a
  blank panel. The neighbours are folded into the existing touched-block
  set, so they are summarised, capped, and fed back through the same
  path – no result is interpreted on the model’s behalf. The number of
  blocks reported is capped (default 50) by the option
  `blockr.assistant_review_max_blocks`. Fixes \#51.

- Result summaries shown to the model are now produced by a
  [`describe_result()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_result.md)
  S3 generic, alongside the existing
  [`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)
  and
  [`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md).
  A package contributing an unusual result type can add a method to
  describe it directly, in blockr terms; the default method delegates to
  [`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html).
  The output is hard-capped before it reaches the prompt, and a
  description that errors – a block may return any R object, and a
  multi-element character vector previously took the whole review down –
  now surfaces the error message instead. So the review stays bounded by
  the block cap times the per-result budget, and one odd result can no
  longer break it. The same character cap is applied to the
  `describe_block` and `list_stacks` tool responses, so no single tool
  reply can flood the prompt either. The per-response character budget
  (default 2000) is set by the option
  `blockr.assistant_summary_max_chars`. Both options also read the
  matching `BLOCKR_*` environment variable.

- The post-apply review the assistant sends itself now includes a short
  result summary of each block the turn touched – the added or modified
  blocks, plus the destination of any added or removed link – so the
  model can catch a block that built but is silently wrong (e.g. a
  filter that yields no rows), not only one that errors. The touched set
  is read off core’s normalised board update, reusing the link-removal
  expansion `preprocess_board_update()` already performs rather than
  recomputing it. The summary is capped at ten blocks with a pointer to
  `get_block_result` / `query_data` for the rest, and the review invites
  the model to inspect downstream results when a change is likely to
  propagate. The per-turn auto-correction bound is raised from two to
  three. Fixes \#43.

- `add_block` now rejects constructor arguments outside a block’s
  documented set (the names `list_available_blocks` reports), turning
  the silent argument-swallow of a constructor `...` into an error the
  model can act on. `list_available_blocks` gains an `inputs` column
  naming each block’s input slots, so links are wired to real slot names
  rather than invented ones. JSON arguments that are arrays of objects
  (a filter’s `conditions`, a summarize’s `summaries`) are now kept as
  lists of records rather than collapsed into a data frame the block
  state cannot consume.

- `set_board_option` now passes the board to blockr.core’s
  [`set_board_option_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_board_options.html),
  adopting the required-`board` signature introduced in
  BMS/blockr.core#229 so the write honours the board’s own lock policy
  rather than bypassing it. Fixes \#52.

- After the assistant applies its staged changes at turn end, it now
  reports the outcome back to the model so it can correct a problem it
  introduced without waiting for the user to notice a red block. Two
  failure channels are surfaced: a board update the model triggered that
  was rejected or failed to apply (`board$last_update`, from
  BMS/blockr.core#200), and blocks that begin raising errors or warnings
  once the change re-evaluates. The latter come from the board-level
  `board$conditions` reactive added in BMS/blockr.core#218: the
  assistant snapshots it at the start of the user’s turn and, once the
  post-apply re-evaluation settles, reports the conditions that appeared
  since (a set-difference keyed on core’s condition id). When something
  is found it injects a short follow-up turn, bounded per user turn so a
  stubborn problem cannot loop. The `get_block_conditions` read tool and
  the per-block health markers in the board summary now read the same
  `board$conditions` source, replacing the package’s own condition
  flattener. Fixes \#29.

- Adds an LLM tool surface for board options: `list_board_options`
  reports each option’s id, category, current value and default, and
  `set_board_option` sets a value, coercing it through the option’s own
  transform. Unlike block / link / stack mutations, option values are
  session-scoped rather than part of the board-update payload, so
  `set_board_option` writes immediately via blockr.core’s
  [`set_board_option_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/new_board_options.html)
  instead of staging into the turn-end flush. The `llm_model` option is
  excluded from the setter, since changing it rebuilds the assistant’s
  own chat client. The board summary gains an Options section listing
  the option surface.

- The board summary in the dynamic system prompt now renders each entity
  through blockr.core’s
  [`str_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/str_value.html)
  generic (and the `str_value` methods blockr.dock supplies for its
  classes), instead of the assistant-owned `summarise_*` S3 generics.
  Those had a single method each, dispatching on classes owned by
  packages *below* this one, so they could never be extended downstream;
  they are now plain internal helpers that call
  [`str_value()`](https://bristolmyerssquibb.github.io/blockr.core/reference/str_value.html).
  Each entity’s compact rendering is owned by its home package – the
  correct extension point and dependency direction – so a stack’s colour
  now appears automatically. The per-block line reports the
  externally-controllable constructor inputs (marked `*`) rather than
  frozen initial argument values, which also removes the old
  `blockr.core:::initial_block_state()` workaround. `describe_block`
  still reports modifiable keys, now via the exported
  [`external_ctrl_vars()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_name.html)
  rather than the raw `external_ctrl` attribute (#20).

- Adds an LLM tool surface for view CRUD and layout mutations: six new
  tools (`list_views`, `add_view`, `remove_view`, `modify_view`,
  `set_active_view`, `rename_view`) backed by an extended staging
  payload that grows a `views = list(add, mod, rm, active)` slot
  alongside the existing `blocks` / `links` / `stacks` slots. The staged
  delta flushes atomically via the same
  [`update()`](https://rdrr.io/r/stats/update.html) channel used by
  interactive actions, composing across slots in a single lifecycle
  tick.

- Layouts move over the wire as the JSON spec form owned by blockr.dock:
  the tools parse and render with dock’s exported `layout_from_json()` /
  `layout_to_json()` /
  [`layout_panel_ids()`](https://bristolmyerssquibb.github.io/blockr.dock/reference/panel-ids.html),
  presenting bare block / extension IDs (dock resolves them to canonical
  panel IDs on flush). The default system prompt picks up a Layout
  subsection documenting the shape and a Views section in the board
  summary (one line per view: name, active marker, panel count).
  `rename_view` is synthesised from add + rm + active carry-over to
  avoid an extra payload slot; the upstream dock receiver is free to add
  a native `rename` later.

- Requires the dock `views` payload slot from BMS/blockr.dock#150 plus
  the
  [`augment_board_update()`](https://bristolmyerssquibb.github.io/blockr.core/reference/board_update.html)
  /
  [`apply_board_update()`](https://bristolmyerssquibb.github.io/blockr.core/reference/board_update.html)
  generics from BMS/blockr.core#185 (relaxed
  `validate_board_update_structure()` so subclass-defined payload slots
  pass through to subclass methods). Fixes \#18.

## blockr.assistant 0.1.0

Feature-complete close-out of the initial roadmap (Phases 1-5). The
biggest changes since the Phase 4 cut:

- The `system_prompt` argument of
  [`new_assistant_extension()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/new_assistant_extension.md)
  now accepts a function (called each refresh with
  `(board, client, last_flush, ...)`) or a string (used verbatim as a
  static prompt with no refresh). The default is the new exported
  function `default_system_prompt`, which composes a four-section
  prompt: an intro / conventions block, an auto-generated tool catalogue
  from `client$get_tools()`, a compact board summary, and (when
  applicable) a one-line flush-rejection note. The prompt is refreshed
  on every materialized board change via an observer on `board$board`,
  so the model always sees the current state of the board – including
  the user’s UI edits between turns (and follow-up requests in a
  multi-tool-call turn).

- Two new exported S3 generics, `summarise_block(x, board, id)` and
  `summarise_stack(x)`, drive the per-entity lines in the board summary.
  Block / stack authors override per class to customise how their
  classes appear in prompt context. Mirrors the existing
  `describe_block` / `describe_stack` pair (full descriptions surfaced
  by the read tools); `summarise_*` is the compact projection used by
  the live prompt, `describe_*` is the drill-down used on demand.

- New `query_data` read tool: evaluates model-supplied R against an
  environment built from
  [`blockr.core::eval_env()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_server.html)
  with every committed block’s result bound by id, captures stdout plus
  the auto-printed value of the last expression, and returns the
  captured text (truncated at 200 lines). The escape hatch for questions
  the static board summary can’t carry: unique values, group counts,
  ad-hoc filters, cross-block joins.

- `flush_pending()` gains an optional `last_flush_error` reactiveVal
  argument. On dispatch-time validator rejection it captures the
  message; on success or no-op it clears. The dynamic prompt reads it
  via the composer’s `last_flush` arg and emits a one-line “your
  previous turn’s changes were rejected” note so the model can recover
  without the user retyping the error.

- Tutorial vignette at the package root
  (`vignette("blockr.assistant")`), surfaced by pkgdown as the
  Get-Started article. Showcase demo at `inst/examples/05-polish/`. The
  `_pkgdown.yml` reference index groups the surface into “Extension” and
  “S3 generics”.

## blockr.assistant 0.0.0.9000

Initial development version (Phases 1-4): extension shell with ellmer
chat, read-only tool layer, staging & dispatch model, mutation tools.
