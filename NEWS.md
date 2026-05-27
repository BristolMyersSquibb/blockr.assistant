# blockr.assistant (development version)

* Adds an LLM tool surface for view CRUD and layout mutations: six
  new tools (`list_views`, `add_view`, `remove_view`, `modify_view`,
  `set_active_view`, `rename_view`) backed by an extended staging
  payload that grows a `views = list(add, mod, rm, active)` slot
  alongside the existing `blocks` / `links` / `stacks` slots. The
  staged delta flushes atomically via the same `update()` channel
  used by interactive actions, composing across slots in a single
  lifecycle tick.

* Layouts move over the wire as a JSON spec form (bare ID,
  `panels(active = ...)`, `group(sizes = ...)`, top-level
  `dock_layout(orientation, sizes, active_group)`) that round-trips
  through new `layout_to_wire()` and `layout_from_wire()` helpers.
  The default system prompt picks up a Layout subsection documenting
  the shape and a Views section in the board summary (one line per
  view, driven by a new exported `summarise_view()` S3 generic that
  custom layout classes can override). `rename_view` is synthesised
  from add + rm + active carry-over to avoid an extra payload slot;
  the upstream dock receiver is free to add a native `rename` later.

* Requires the dock `views` payload slot and `view_data` reactive
  from BMS/blockr.dock#150 / BMS/blockr.dock#146 plus the
  `augment_board_update()` / `apply_board_update()` generics from
  BMS/blockr.core#185 (relaxed `validate_board_update_structure()`
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
