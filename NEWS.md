# blockr.assistant (development version)

* Saving a board no longer aborts on "attempt to apply non-function". Since
  0.1.0 the extension asked the mounted chat module to flush its live thread
  before reading the store, through `mod$history$save()` -- a member the
  module object did not carry when that call was written. The
  `chat_server()` function built `mod$history` as a locked environment
  holding `on_save` and `on_restore`, with `save_current()` on the history
  controller behind it,
  so the call head evaluated to `NULL` and every save died, on any session
  that had mounted the chat and whether or not the board had been touched.
  Upstream has since added the member, in shinychat `7484ce6e` (2026-08-25),
  so the call does resolve against a current build. The flush is dropped
  rather than rewired onto it, which keeps the save path off an addition
  younger than the bug and costs a question typed but not yet answered when
  the save happens; shinychat records a thread once the model replies, and
  everything it has recorded still saves. The `chat_save_turns` budget is
  now asked first, so a deployment that set it to `0` has its chat neither
  written nor read at save time.

* The `fake_chat_mod()` double no longer offers a `history$save()` of its
  own. Inventing a member the real module lacked is what let the call above
  pass wherever the module was mocked, and one test asserted it.

* The board check run after a commit no longer reports the state of a block
  the model merely modified. Core applies a `blocks$mod` delta by writing
  each field straight into the block's state reactive value, with no
  validation and no revert, so that read-back handed the model back the
  delta it had just sent, and the review invitation asked on every commit
  for a comparison whose answer was fixed. A check that always confirms is
  worse than no check: it costs a step each time and trains the model to
  skim a section that also carries the result summaries and the
  new-condition report. A block the model added still reports its state in
  full, its constructor having resolved every argument the model never
  named -- that is the case where the read-back carries news. The commit
  tool's description and the system prompt, which both described the
  payload as results and problems, now say what a commit hands back (#146).

* The `add_panel_to_view` and `move_panel` tools now reach a view's
  rails. A view could be born with a rail -- its `add_view` layout takes
  one, and `list_views` reports it -- but nothing edited one afterwards:
  the panel-op tools addressed the splitview alone, so "park the
  assistant on the left edge" of a view already on screen had no verb
  behind it, and the model was shown a rail it could not touch. Both
  tools gain a `rail` argument naming an edge, threaded into the panel
  ref as blockr.dock's fourth placement hint. A rail is an edge of the
  whole view where `near` / `side` name a spot inside its splitview, and
  both vocabularies spell "left" and "right", so `rail` combines with
  neither -- nor with `size`, a ratio along a split axis a rail does not
  have. Moving a panel back out of a rail needs no new key: it is a
  `move_panel()` call carrying `near` / `side` and no `rail`. A rail move
  has no anchor, so `near` becomes optional on `move_panel`, which now
  rejects a call naming neither destination. The `layout` skill dropped
  two sentences stating that no verb reaches a rail (#137).

* Block state now reaches the model in two tiers, with a new
  `get_block_state` tool behind the summary. State is rendered with
  `utils::str()`, which cuts a character value at 128 characters and marks
  the cut with its own `| __truncated__` -- not this package's marker
  vocabulary, and naming no tool. A long argument such as a code block's
  `script` or a filter expression therefore arrived looking like a complete
  short value, and since `modify_block` replaces the whole value, a model
  that read a prefix wrote that prefix back and dropped the rest. A value
  the summary cannot show in full is now omitted from it and marked with
  the tool that has the text, rather than shown in part; `get_block_state`
  returns a block's live argument values as the board holds them, bounded
  by one budget spent across them (`assistant_state_max_chars`, 20000 by
  default) instead of by `str()`. Both summary surfaces are covered -- the
  `describe_block` state section and the board check run after a commit --
  and the system prompt now says of configuration what it already said of
  results: read the full value before rewriting it (#143).

* The `describe_block` tool now reports a block's live argument values
  rather than the ones it was constructed with. The description was
  rendered off the board's block object, whose constructor frame is fixed
  at construction, so a block the model had just modified -- or one the
  user had edited in the block's own UI -- read back at its load-time
  values, and a question about what a block filters on was answered from
  a filter that had since been replaced. Live state is read from
  `board$blocks[[id]]$server$state`, where a committed `blocks$mod` delta
  and the block's own UI observers both write, and reaches core's
  rendering through a `state` argument the `describe_block()` generic
  grows. A block that never constructed holds no state and falls back to
  the constructor values, the section label saying which of the two is
  shown. Existing methods absorb the new argument through `...` and keep
  today's behaviour (#133).

* The board check the assistant runs itself after a commit now reports
  the state of each block the model changed, alongside the results it
  already carried. The read-back was results and conditions only, so a
  change its result summary did not distinguish -- a renamed block, a
  plot colour, a filter that happens to select the same rows -- read back
  as though nothing had happened. State is the more dependable half of
  the pair: a block that goes dormant after the change has no result to
  report but still holds correct state. Only the blocks the model added
  or modified carry it; the neighbours pulled in to show propagation
  stay results-only (#133).

* The layout tools now speak the rails a view pins to its left or right edge
  (blockr.dock's `rail()`). Reporting a view read only its grid tree, so every
  panel a rail held went missing from what `list_views` handed the model -- on
  a stock board that is the assistant's own panel, which the default
  arrangement rails on the left. Rails now ride the layout wire format as a
  top-level `rails` key, sibling of `focus` and keyed by edge, carrying each
  rail's `panels`, open `active` tab and `collapsed` state. The `add_view` tool
  reads the same key, so a view the model creates can be arranged the way the
  board arranges its own rather than un-railing the extensions on every new
  view. A rail's width stays off the wire: grid `sizes` are ratios while a
  rail's size is absolute pixels, and one word carrying two meanings is how it
  gets used wrong (#134).

* The chat holds several conversations per board rather than one. A history
  control in the footer, beside the token meter, opens a drawer listing
  every thread, with switching, renaming, deletion, search and
  model-written titles, and the whole set rides into board state as
  recorded turns, which blockr.core's file seam carries as they stand.
  The `chat_save_turns` budget applies per thread and cuts between
  exchanges rather than inside one, so a trimmed thread never opens on a
  reply or on a tool result stranded from its request; `0` still writes
  nothing at all. A board holding anything else under `history` opens
  without its conversation rather than on a guess at one (#127).

* Swapping the `llm_model` board option now hands the new client to the
  mounted chat instead of remounting it. A remount rendered a fresh chat
  element, and conversation storage partitions on that element's id, so
  every thread recorded before a swap would have been stranded under the
  old one.

* Which thread is open is remembered by the browser rather than in board
  state, so a board reopened elsewhere lists its threads without selecting
  one.

* The token meter counts the conversation rather than the last exchange, and
  the block focus selection travels with the conversation too. Both are saved
  alongside the thread's turns, restored when you switch back to it, and start
  over in a new one -- a meter and a focus left pointing at the thread you just
  left are worse than none.

* A collapsed dock panel no longer leaves a sliver of chat behind it, and the
  history button stays in the panel's corner instead of drifting into the
  middle of the transcript. Dock renders panel content in an overlay layer, so
  the panel's own container reads to the chat as an unrelated element
  overlapping the button's corner, and the button nudges away from it until it
  hits its travel limit.

* The `/clear` command is gone. Starting a fresh thread is the history
  drawer's own affordance, and nothing in `shinychat`'s server API opens
  one, so a command that emptied the transcript would have left the stored
  thread behind for the next response to extend. Opening a thread still
  drops the changes staged against the one before it.

* The chat's command palette gained two built-in commands, listed
  alongside the user-invocable skills it already carried. The `/compact`
  command runs the conversation through the same summarise-and-replace
  that `chat_compact_tokens` triggers on its own, without waiting for the
  threshold -- what a stale thread needs rather than a large one, where a
  long build has finished and the next question is unrelated to it. It does
  not echo its invocation into the transcript, being about to rewrite it.
  Built-ins are registered ahead of the skills, so a deployment skill that
  takes one of their names is the registration refused and logged, rather
  than one that silently shadows a built-in (#125).

* The assistant can now be pointed at particular blocks. A picker below the
  chat lists the board's blocks -- the rich selectize the board itself uses
  wherever a block is chosen, reached through
  `blockr.dock::board_block_select()` -- and whatever is selected there is
  named to the model in a `## Focus` section of the system prompt, under the
  same `- <id> <block>` identity the `## Board` section carries so the two
  tie together. The section says where the user's attention is rather than
  what the model may touch: it biases an under-specified request towards the
  selection without narrowing what can be asked or which tools are reachable.
  A focus change reaches the model on the next request the way a board change
  does, and a block that leaves the board drops out of the selection rather
  than leaving the prompt naming an id that is gone. Selecting nothing is how
  the focus is cleared, and returns the prompt to what it was byte for byte.
  The composer gained a `focus` argument for this, so a custom
  `system_prompt` function that accepts `...` is unaffected. Focus is session
  state: it is not written to the extension's `state` and so does not survive
  a board save and restore (#122).

* Block mutation is now available through typed, per-block-type tools, so
  a block's constructor arguments reach the model as a checked schema
  rather than a JSON string it has to hand-write. A type qualifies when
  every registered argument declares a `type` in the block registry --
  which, across `blockr.core`, `blockr.dplyr`, `blockr.ggplot` and
  `blockr.io`, is 26 of 31 registered types for `add_<type>` and 17 of the
  19 externally controllable ones for `modify_<type>`. Registering one per
  type up front would put roughly 43 extra tools in the manifest, so they
  are materialized on demand instead: `describe_block_type` registers
  `add_<type>` and `describe_block` registers `modify_<type>` for the
  block's own type, both of which the model already calls before
  configuring. Schemas are built through `ellmer`'s own type constructors
  rather than handed over as raw JSON schema, so each provider receives
  the dialect it states tool schemas in -- Gemini rejects outright the
  `additionalProperties` that OpenAI's strict mode requires, and a raw
  schema would have sent one spelling to all of them. The two kinds are
  held in separately capped, separately
  evicted pools sized by the `blockr.assistant_block_tool_pool` option
  (default 20 each), least recently used first. Since a pool is also
  bounded by how many types qualify, that default tops out at 37 typed
  tools alongside the 38 static ones in the stack above. A tool armed
  during the current turn is never evicted; when a pool is full of such
  tools the arming is refused and the model is told to fall back rather
  than overflowing the cap. The `add_block` and `modify_block` pair is
  unchanged and stays registered: five argument shapes across the stack --
  free-form reader and writer `args`, an arbitrary-key `renames` map, an
  any-type `values_fill` -- cannot be expressed as a closed-key schema at
  all, and those types keep using it.

* The system prompt no longer carries a tool catalogue. Registered tools
  already reach the model as a structured manifest alongside the prompt,
  so the catalogue duplicated them, and it would have gone stale mid-turn
  now that the per-type tools come and go. The `client` argument of
  `default_system_prompt()` is kept for custom composers that read the
  model or token state off it.

* Nothing bounded the live conversation, only what was written to the
  board, so a long session grew more expensive with every message and
  eventually exceeded the provider's context window -- and since that
  limit is reached by accumulation, every later message was over it
  too, leaving the chat dead until the extension was remounted. The
  conversation is now compacted: once an exchange exceeds the
  threshold, the older turns are replaced by a summary the model writes
  of them and the recent turns are kept verbatim. The threshold counts
  what the provider billed for the last exchange rather than turns,
  that being what a context window is spent in. A restored board is
  checked on mount too, so reopening a long conversation no longer
  lands already over the limit. Fixes #101.

* The compaction threshold is a board option, `chat_compact_tokens`, so
  it can be retuned during a session rather than fixed at deploy time:
  it trades recall against how soon the chat starts summarising, and
  the right value moves with the model, which is itself a board option.
  It defaults to `Inf`, leaving compaction off. A threshold suited to
  one provider's context window is wrong for another's, and no provider
  reports that window through `ellmer` (see tidyverse/ellmer#1083), so
  any number shipped here would be a guess -- silently doing nothing on
  a small-context model and discarding history needlessly on a large
  one. A deployment that knows its models sets the starting point
  through the new `blockr.chat_compact_tokens` option (or
  `BLOCKR_CHAT_COMPACT_TOKENS`), and a user can choose a value for
  their own session. This is deliberately unlike
  `blockr.chat_save_turns`, which stays deployment-only because it
  governs whether conversations may be written to a shared file.

* How much of the conversation survives a compaction is a board option too,
  `chat_compact_keep` (or `blockr.chat_compact_keep`), counting the most
  recent turns kept verbatim while everything older becomes the summary.
  The two controls take different shapes because the quantities do: the
  threshold is a combobox over a ladder of context sizes that also accepts
  a typed value, `64k` and `1.5M` included, since real context windows run
  from a few thousand tokens to a million and `Inf` has to be expressible;
  the turn count is a slider over doubling rungs to 256, since it needs no
  such sentinel and stops meaning much at the top -- keeping 256 turns
  verbatim is already barely compacting.

* The chat transcript comes back with the conversation. It was left
  empty by anything that remounted the chat panel -- reopening a saved
  board, or switching provider -- because `shinychat` builds the
  transcript by appending turns to the DOM as they arrive, and the
  replay that would rebuild it from the client is reached only when its
  `history` argument is on, which it is not. The model remembered a
  conversation the user could no longer see. The extension now replays
  the client's turns itself on every mount, which is also what lets
  compaction drop turns without stranding them on screen.

* Block eval status now reaches the model. Each block line in the Board
  summary carries a marker while the block holds no current result
  (`[dormant]`, `[stale]`, `[waiting]`, `[unset]`, `[failed]`),
  `list_blocks` gained a `status` column, and `describe_block` names the
  status and what it means. The three sites that read a result --
  `get_block_result`, `query_data` and the post-commit review -- report the
  status in place of a generic failure. They had no way to tell a never
  configured block from an off-screen one: a dormant block's `result()`
  re-enters its gated pipeline and raises a `shiny.silent.error` whose
  message is the empty string, so `get_block_result` rendered "has not
  evaluated successfully: " with nothing after the colon, `query_data`
  dropped the block into an unexplained skip list, and the review printed
  "(no result yet -- see conditions below)" against a block with no
  conditions to see. The distinction matters most for blockr.core's sixth
  eval status, `stale` -- a dormant block an upstream has since invalidated
  -- where the model was told a healthy block had failed and would go on to
  reconfigure it, or would reason about columns from a description its
  upstream no longer matches. Reading a result still never forces
  evaluation, so an off-screen block stays off-screen. Fixes #107.

* The `get_block_conditions` tool now says when its report is a snapshot. An
  off-screen block does not re-evaluate, so its captured conditions date from
  its last run -- and an empty report rendered as "no active conditions (no
  errors, warnings, or messages)", an affirmative all-clear, for a block that
  had simply not re-run since the model broke it. Both routes into that state
  are real: an upstream change marks the block `stale`, while an edit to the
  off-screen block itself leaves it `dormant`, since staleness tracks upstream
  results rather than a block's own expression. A `dormant` or `stale` block's
  conditions now carry the caveat and name which of the two applies, so an
  empty report reads as unknown. Nothing here makes such a block evaluate;
  until it does, its conditions cannot be brought up to date.

* A turn the provider rejects outright -- an exhausted quota, an
  over-long context, a dropped connection -- now reports the error in
  the chat instead of leaving a spinner that never resolves and a
  composer that stays locked. Such a stream fails before it yields
  anything, which is ahead of the first `await` in `shinychat`'s
  streaming coroutine, so the error escaped the promise chain that
  renders mid-stream failures: on a typed message it landed in the
  `ExtendedTask` whose result nothing reads, and on a slash command it
  was thrown straight out of the deferred append. That reporting now
  comes from `shinychat` rather than from here --
  posit-dev/shinychat#304 rejects the promise instead of throwing, which
  covers both call sites, since a slash command reaches the same
  streaming function through `append()`. The local workaround has been
  retired accordingly; a version floor cannot express the requirement,
  as `shinychat` reads `0.4.0.9000` on either side of the fix, so the
  `Remotes:` entry is what carries it until the next release. Fixes #102
  and #118.

* Task-specific instruction is now file-based. A **skill** is a
  directory holding a `SKILL.md` of YAML frontmatter plus a markdown
  body, discovered from `blockr.assistant_skills` (an option or the
  matching environment variable) alongside the package's own
  `inst/skills`. Only each skill's one-line `description` is always on;
  the body is loaded on demand through a new `read_skill(name, file)`
  tool, so a deployment can teach the assistant its conventions without
  paying for them on every turn -- and without writing R. A skill
  scoped to neither `blocks` nor `extensions` is listed in a new
  `## Skills` section of the default system prompt; a block-scoped one
  surfaces in `describe_block_type()` and `describe_block()` next to
  the block's `guidance` and takes precedence over it, and an
  extension-scoped one in `describe_extension()`. `requires` gates a
  skill on installed packages, using R's own dependency spelling: an
  unmet requirement makes the skill absent from every catalogue and
  refused by `read_skill`. A `user-invocable` skill also registers a
  `/name` slash command that runs it against the rest of the typed
  line. `default_system_prompt()` gains a `skills` argument.
  Fixes #99.

* The layout grammar is no longer spliced into every prompt. The ~5 KB
  `inst/prompts/layout.md` fragment becomes the built-in `layout`
  skill, read on demand; `add_view` and `list_views` point at it.
  Turns that never touch the view tools -- which is most of them,
  since `blockr.dock` auto-places panels for newly added blocks -- no
  longer pay for it.

* A board saved after any assistant turn could not be reopened. The
  recorded turns were written into board state as a nested structure,
  which does not survive the board's JSON round trip: `jsonlite` reads
  `version` back as an integer and typed props such as `tokens` as
  lists, both of which `ellmer::contents_replay()` rejects. Because the
  replay runs in a board server observer, the failure took down the
  whole board rather than just the chat panel. Boards saved in that
  shape now open again -- `blockr_deser()` drops the legacy payload,
  which is mistyped beyond what is worth repairing. Fixes #97.

* The conversation is now saved with the board as an opaque
  `jsonlite::serializeJSON()` blob, which round-trips losslessly, and
  is restored into the chat when the board is reopened. How many of
  the most recent turns are written is read at save time from the new
  `blockr.chat_save_turns` option (or the `BLOCKR_CHAT_SAVE_TURNS`
  environment variable), which takes `0` for none, a positive whole
  number, or `Inf` for all, and defaults to 50. It describes the
  deployment rather than the board, so it is neither a constructor
  argument nor part of board state -- worth setting to `0` where
  boards are shared, since the file otherwise carries whatever was
  typed into the chat. Each turn's raw
  provider response is stripped before saving, and the saved window is
  trimmed to whole exchanges so it never opens or closes on half of a
  tool call.

* The read tools now follow a lean-listing / per-item-detail split: a
  listing carries only the fields you pick an item on, and bloat-prone
  detail moves to a companion drill-down tool. `list_block_types`
  (renamed from `list_available_blocks`) keeps id, name, package,
  category, a one-line description and the input slots; its `guidance`,
  per-argument specs and worked `examples` move to a new
  `describe_block_type(id)`. `list_stacks` drops its `description`
  column for a new `describe_stack(id)`, and `list_extensions` drops
  the controllable variables' current `values` for a new
  `describe_extension(id)` -- keeping a document extension's full text
  out of every listing row. The block and extension descriptions that
  stay in the listings are trimmed to
  `blockr.assistant_description_max_chars` (default 1000), each
  pointing at its drill-down tool for the full text. Lean listings are
  inherently bounded, so no row cap or JSON truncation is needed.
  Fixes #85.

* Staged changes are no longer auto-applied at the end of a turn. When
  the model ends a turn with uncommitted staged changes, it is now
  prompted to resolve them explicitly -- `commit` to apply them (with the
  in-band review) or the new `discard` tool to drop them -- rather than
  the board being changed behind the model's back and the review arriving
  on the next turn. Every apply now flows through the single `commit`
  path, so staging genuinely means nothing is applied until a commit. The
  prompt is bounded; unresolved staged changes are dropped after a few
  reminders. This retires the turn-end backstop and its out-of-band
  review injection. Fixes #91.

* `remove_block()` now also cleans up the links and stacks staged for
  the block in the same turn, not just the ones already on the board.
  Core's own cleanup in `augment_board_update()` only sees committed
  links and stacks, so staging a block, wiring it up or slotting it
  into a stack and then removing it again was rejected ("Expecting all
  links to refer to known block IDs", or "Unknown block ... is assigned
  to stack ...") -- and because staging validates before it writes, the
  removal was a silent no-op. The model therefore could not retract a
  block it had just wired until it committed, which is when it is most
  likely to want to. Staged link modifications and staged stack
  memberships that point at the removed block are cleaned up as well,
  and the tool result names the links that went with the block.
  Fixes #88.

* The system-prompt board summary is now bounded by a character
  budget, so a large board no longer inflates every request. Each
  section (blocks, links, stacks, options, views, extensions) is
  trimmed independently to `blockr.assistant_board_section_max_chars`
  (default 1500), each pointing at its own listing tool -- so a long
  block list can no longer crowd out a later section such as the
  extensions -- replacing the previous all-or-nothing fallback that
  dropped the whole summary at once. Fixes #58.

* The system prompt's board summary now lists the board's dock
  extensions -- each one's name, its externally controllable
  variables, and the self-description it supplies. The model thus
  sees an extension's own guidance on how to drive it directly in
  the prompt -- for instance a workflow diagram's advice to move a
  block via its position handle rather than the panel tools --
  instead of having to call `list_extensions` first. `describe_board()`
  is a new generic backing the summary, with a `dock_board` method
  adding the view and extension sections. Fixes #59.

* The assistant reads the live board layout from blockr.dock's
  `view_data` reactive rather than the committed board, so
  `list_views` and the system prompt's view summary reflect
  UI-driven panel rearrangements immediately. Both fall back to
  the committed board until every view has reported its layout.
  Fixes #60.

* `resize_panel(view, panel, size)` sets a panel's group `size` (a
  ratio in (0, 1)) along its splitview axis, staging blockr.dock's
  `resize` panel-op verb. `add_panel_to_view()` gains a matching
  optional `size` to record a panel's target size as it is added.
  Fixes #69.

* The assistant now applies its staged changes through an explicit
  `commit` tool that returns the touched blocks' results as its own
  tool result, in-band. The model can stage a unit of work, commit,
  read what it built and correct it -- all within one turn -- instead
  of the review arriving as a synthetic user message on the next turn.
  Fixes #73.

* `focus_panel(view, panel)` brings a panel already in a view to the
  front of its tab group and focuses it, switching to that view if it
  isn't the active one. It stages blockr.dock's `select` panel-op
  verb -- the last one no assistant tool emitted -- so the view-edit
  surface now covers add / remove / move / focus. Use it to surface a
  specific block or extension, e.g. one the assistant just added or
  evaluated. Fixes #71.

* Editing an existing view is now done with atomic panel-op tools --
  `add_panel_to_view()`, `remove_panel_from_view()` and
  `move_panel()` -- that map one-to-one onto blockr.dock's panel
  operations, each carrying optional `near` / `side` placement hints
  (`within` / `left` / `right` / `above` / `below`). They replace
  `modify_view()`, whose whole-layout JSON was both awkward for a
  model to edit and carried geometry that dock's membership-only view
  validation now rejects. Each call stages one verb into the pending
  update, and a turn's edits on a view compose into a single atomic
  update at flush. Fixes #64.

* The view-layout tools track blockr.dock's restructured layout
  API, in which a view carries panel *membership* and a separate
  `dock_grid` carries the *arrangement* -- dock's bare
  `dock_layout()` constructor and `layout_from_json()` are gone.
  `add_view` still seeds a new view's arrangement from the layout
  you pass, and `list_views` / `validate_layout` speak the same
  compact JSON spec as before, now parsed into a `dock_grid`.
  Changing which panels an existing view holds is a membership edit,
  with the live arrangement staying dock's to own (its settled-echo
  grid mirror is the sole grid writer). Restores a clean install and
  `R CMD check` against blockr.dock `main`. Fixes #65.

* `list_available_blocks` now surfaces the block construction
  metadata blockr.core formalised in BMS/blockr.core#121. It gains a
  `guidance` column (model-facing construction notes) and an
  `examples` column (complete worked configurations keyed by argument
  name), and its `arguments` column now maps each argument to its
  description and machine-readable JSON-Schema `type` descriptor
  (`arg_string()`, `arg_enum()`, ...) rather than a bare description
  string -- so an argument's allowed values and shape reach the model,
  not just prose. All of it is read through core's new
  `block_metadata()` / `block_arg_*()` accessors. Previously the
  `examples` / `prompt` attributes the registry carried were dropped
  before the model ever saw them, so the assistant had neither a
  worked example nor construction guidance when configuring a block;
  `add_block` now points the model at both. The deprecated
  `registry_metadata()` calls are replaced by `block_metadata()` and
  `block_meta_arguments()`. Fixes #54.

* The post-apply review now reports each touched block together with
  its immediate neighbours -- the blocks feeding it and the blocks it
  feeds -- not just the block itself. A block wired to a column or
  element that is not in its input -- the usual cause of an empty or
  errored panel -- previously left the model to guess the fix from the
  error alone; it now also sees the input's own result (and the
  consumers, to confirm the change propagated), so it can correct the
  reference or loosen an over-strict filter on its next turn instead of
  leaving the user a blank panel. The neighbours are folded into the
  existing touched-block set, so they are summarised, capped, and fed
  back through the same path -- no result is interpreted on the model's
  behalf. The number of blocks reported is capped (default 50) by the
  option `blockr.assistant_review_max_blocks`. Fixes #51.

* Result summaries shown to the model are now produced by a
  `describe_result()` S3 generic, alongside the existing
  `describe_block()` and `describe_stack()`. A package contributing an
  unusual result type can add a method to describe it directly, in
  blockr terms; the default method delegates to `btw::btw_this()`. The
  output is hard-capped before it reaches the prompt, and a description
  that errors -- a block may return any R object, and a multi-element
  character vector previously took the whole review down -- now surfaces
  the error message instead. So the review stays bounded by the block
  cap times the per-result budget, and one odd result can no longer
  break it. The same character cap is applied to the `describe_block`
  and `list_stacks` tool responses, so no single tool reply can flood
  the prompt either. The per-response character budget (default 2000)
  is set by the option `blockr.assistant_summary_max_chars`. Both
  options also read the matching `BLOCKR_*` environment variable.

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
  ...)`) or a string (used verbatim as a static prompt with no
  refresh). The default is the new exported function
  `default_system_prompt`, which composes a three-section prompt:
  an intro / conventions block, an auto-generated tool catalogue
  from `client$get_tools()`, and a compact board summary. The
  prompt is refreshed on every materialized board change via an
  observer on `board$board`, so the model always sees the current
  state of the board -- including the user's UI edits between
  turns (and follow-up requests in a multi-tool-call turn).

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

* Tutorial vignette at the package root
  (`vignette("blockr.assistant")`), surfaced by pkgdown as the
  Get-Started article. Showcase demo at
  `inst/examples/05-polish/`. The `_pkgdown.yml` reference index
  groups the surface into "Extension" and "S3 generics".

# blockr.assistant 0.0.0.9000

Initial development version (Phases 1-4): extension shell with
ellmer chat, read-only tool layer, staging & dispatch model,
mutation tools.
