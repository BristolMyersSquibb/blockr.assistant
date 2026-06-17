# Read-only tool layer

## Goal

Phase 2 turns the board-blind chat shell from Phase 1 into an assistant
that can *look* at the board. We register a set of read-only `ellmer`
tools on the chat client, each implemented as a closure over the
extension server’s `(board, update, session)` references. By the end of
Phase 2 a user can ask “what blocks do I have?”, “what does `my_subset`
do?”, or “what does the result of `my_filter` look like?” and get an
answer grounded in the live board state. No mutation tools yet — those
are Phase 4, and they ride on top of the staging layer added in Phase 3.

The phase introduces three S3 generics that the rest of the package —
and downstream packages — will lean on:

- `summarise_result(x, ...)` turns a block’s evaluated output into
  terse, LLM-shaped text. The default forwards to
  [`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html);
  override per-class where the default isn’t enough.
- `describe_block(x, board, id, ...)` returns the multi-line description
  that the `describe_block` tool reports back to the model. The default
  method operates on the base `block` class via the registry’s generic
  metadata; block packages can override their specific class if the
  generic output isn’t enough.
- `describe_stack(x, ...)` is the stack counterpart: a one-line (or
  short multi-line) description per stack, returned alongside the basic
  enumeration fields by `list_stacks`. The default method on base
  `stack` covers id / name / blocks; stack-class extensions
  (e.g. `blockr.dag`’s `dag_stack`, which adds a colour attribute)
  override their class to surface their extra fields.

A fourth axis — letting *sibling dock extensions* contribute tools — was
considered and deferred. It depends on upstream changes in `blockr.dock`
(init ordering, sibling state access, and ultimately an external-control
channel) that are out of scope for Phase 2. See \#4 and
`blockr.dock#129`.

## Scope

In:

- Six tool factories of signature
  `function(board, update, session) -> ellmer::ToolDef`, living in
  `R/tools-read.R`. A single `register_read_tools()` helper calls each
  factory and registers its `ToolDef` on the chat client.
- Tools shipped:
  - `list_blocks`
  - `describe_block`
  - `list_links`
  - `list_stacks`
  - `list_available_blocks`
  - `get_block_result`
- A revised default system prompt that drops the “you cannot, yet” hedge
  and instead introduces the inspection toolkit.
- A demo app `inst/examples/populated-board/` mounting the extension on
  a small concrete board: a `dataset_block("iris")` feeding into a
  `subset_block`. Two blocks, one link, evaluated results on both —
  enough to exercise `list_blocks`, `describe_block`, `list_links`, and
  `get_block_result` end-to-end.
- Unit tests exercising each tool against a `testServer`-driven board
  fixture and against fakes for the non-reactive parts.

Out (deferred to later phases):

- Any mutation. No `add_*` / `remove_*` / `modify_*` tools.
- The staging layer (Phase 3). Read-only tools have no pending state to
  merge against — they read board structure and live results directly.
- Dynamic board summary in the system prompt (Phase 5). The persona is
  rewritten to mention tools, but the prompt itself is still static —
  the model discovers the board through tool calls, not through prompt
  injection.

## Architectural decisions

### Tools as closures over `(board, update, session)`

Each tool is built by a factory of signature
`function(board, update, session) -> ellmer::ToolDef`. The factory
closes over the extension references and constructs the `ToolDef` once
at server start. The implementation function inside the `ToolDef` is
itself a closure over the *same* references, so it always sees the
current board via `board$board` / `board$blocks`.

### Extensibility via S3 generics

Two axes need extensibility surfaces — both S3 generics, both following
patterns the blockr ecosystem already uses for things like
[`block_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_name.html)
and
[`block_inputs()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_name.html).

**Per-block-class — the
[`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)
generic.** The `describe_block` *tool* registered with `ellmer` takes an
`id`, fetches the corresponding block off `board$blocks`, and delegates
to `describe_block(block, board, id)`. Default behaviour lives on
`describe_block.block` and produces the description from the registry’s
generic block metadata (constructor name, argument descriptions,
external-control flag, current parameter values, incoming links). A
block author whose block class deserves a richer description simply
defines `describe_block.<their_block_class>`. No coupling to
`blockr.assistant` beyond an `@export` on the method — they don’t even
have to import the generic if `@method describe_block <class>` + roxygen
handles registration. The default is the steady state for ~all blocks;
overrides are an escape hatch, not a requirement.

**Per-stack-class — the
[`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md)
generic.** Same shape, applied to stacks. Unlike blocks, there is no
separate `describe_stack` tool — the `list_stacks` tool calls
`describe_stack(stack)` for every stack it lists and surfaces the result
alongside the basic fields. The default `describe_stack.stack` returns a
short summary covering id / name / blocks. Stack classes that carry
extra attributes — `blockr.dag::dag_stack` adds a colour, future
variants may add layout hints — override
`describe_stack.<their_stack_class>` to surface them. `blockr.assistant`
focuses its default on the base stack class only; everything
class-specific is downstream’s call.

**Sibling dock extensions — deliberately not exposed in Phase 2.** We
explored a third generic — `assistant_tools(extension, ...)` — that
would have let sibling dock extensions contribute their own tools. The
interesting use case isn’t reading sibling state but *manipulating* it
(e.g. “set the markdown content of the md extension”), which needs an
external-control mechanism for extensions that `blockr.dock` doesn’t yet
provide. Even the read-only variant requires upstream changes: extension
servers run via [`lapply()`](https://rdrr.io/r/base/lapply.html) with no
ordering guarantee, and there is no API to read sibling-server return
values. Shipping the generic without those upstream pieces would
constrain it to stateless contributions, which is materially less
interesting than the per-block axis. The design is preserved in \#4; the
upstream prerequisite is tracked at `blockr.dock#129`.

### Result summarisation via `summarise_result()`

A block’s evaluated result is *any* R object — a data.frame, a `ggplot`,
a list, a fitted model, a raster, a large list of large lists. Two
consequences:

1.  JSON-serialising the full object is a non-starter. It blows up the
    token budget and conveys nothing the model can act on.
2.  We need an LLM-shaped *summary* whose format depends on the object’s
    class.

We introduce `summarise_result()` as an exported S3 generic. The default
method forwards to
[`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html),
which already ships class-specific methods for data frames
(`skimr`-style), tibbles, matrices, etc., and falls back to a truncated
[`print()`](https://rdrr.io/r/base/print.html) for everything else. The
generic gives us a single hook for the cases where `btw_this()` is
either missing a method or returns something we’d rather replace:

``` r

#' Summarise a block result for the LLM
#'
#' Generic dispatch on the result's class. The default forwards to
#' [btw::btw_this()]. Define methods to override the summary for
#' specific result classes (e.g. when btw lacks a method or its
#' output is too verbose for token budgets).
#'
#' Methods should keep their output bounded — roughly 1–2 KB of
#' text per call is a sensible ceiling. The LLM pays in tokens for
#' every line returned, and an unbounded `print()` of a large
#' object will both blow the budget and bury the relevant
#' structural information in noise. The default (`btw::btw_this()`)
#' truncates aggressively; overrides should too.
#'
#' @param x A block result, as returned by the block's `result`
#'   reactive.
#' @param ... Passed to methods.
#' @return Character vector of lines.
#' @export
summarise_result <- function(x, ...) {
  UseMethod("summarise_result")
}

#' @export
summarise_result.default <- function(x, ...) {
  btw::btw_this(x, ...)
}
```

`get_block_result` consumes the generic:

``` r

tool_get_block_result <- function(board, update, session) {

  ellmer::tool(
    function(id) with_tool_errors("get_block_result", {

      blks <- isolate(board$blocks)
      if (!id %in% names(blks)) {
        return(sprintf(
          "No block with id %s. Call list_blocks first.", id
        ))
      }

      res <- tryCatch(
        isolate(blks[[id]]$server$result()),
        error = function(e) e
      )

      if (inherits(res, "error")) {
        return(sprintf(
          "Block %s has not evaluated successfully: %s",
          id, conditionMessage(res)
        ))
      }

      paste(summarise_result(res), collapse = "\n")
    }),
    name = "get_block_result",
    description = paste(
      "Return a short text summary of a block's current evaluated",
      "output. Data frames are summarised with skimr-style stats;",
      "other objects fall back to a truncated print. Returns an",
      "error string if the block has not evaluated successfully."
    ),
    arguments = list(
      id = ellmer::type_string(
        "Block id, as returned by list_blocks."
      )
    )
  )
}
```

`board$blocks` is reachable from the extension callback because
`blockr.core`’s board server stores it on the same `reactiveValues` it
later passes through `make_read_only()`
(`blockr.core/R/board-server.R:60-70`, `R/utils-shiny.R:13`). The
`make_read_only` wrapper preserves `reactiveValues` semantics, so
`board$blocks[[id]]$server$result()` is a live reactive — calling it
from inside the tool function (which runs in the chat module’s reactive
context during `chat_mod_server`’s turn handling) returns the current
evaluated result.

Phase 2 ships only the default `summarise_result()` method. Bespoke
methods come when we hit a result class where the default output is
unsatisfactory — at which point the override is one method definition,
no plumbing.

### Read-only tools snapshot, they do not subscribe

Every tool function returns a value derived from a *current* read of the
board (`board$board`, `board$blocks`, the block registry). They do not
set up `observe`/`reactive` machinery — there is nothing for them to
push, only pull. This keeps the tool layer cheap and free of leaked
observers when the chat client is rebuilt.

All reactive reads inside tool bodies are wrapped in `isolate()`.
[`shinychat::chat_mod_server()`](https://posit-dev.github.io/shinychat/r/reference/chat_app.html)
invokes tool functions from inside its own observer chain, so an
un-isolated read of `board$board` would register the enclosing observer
as a dependent of the board slot. Each subsequent board mutation would
then re-fire the observer for the lifetime of that reactive context,
which is not what we want — tools want a one-shot snapshot. Wrapping
every reactive read (`board$board`, `board$blocks`,
`...$server$result()`) in `isolate()` gives us the current value without
the dependency. `isolate()` is also safe when called from non-reactive
contexts (e.g. unit tests), so we can pay the wrapping cost uniformly.

A consequence: if the user adds a new block mid-conversation and then
asks “what blocks do I have?”, the next `list_blocks` call sees the new
block correctly, because the tool reads the *current* reactive board
state at call time (just without subscribing to it).

### Result shape: structured-but-stringy

`ellmer` serialises tool return values to JSON for the model. We return
data.frames where structure helps the model (`list_blocks`,
`list_links`, `list_stacks`, `list_available_blocks`) and plain strings
where prose is clearer (`describe_block`, `get_block_result`). We do
**not** wrap tool returns in a custom envelope: ellmer’s auto-conversion
handles the JSON encoding, and a “looks like an error message” string is
the cheapest possible recovery signal for the model when something goes
wrong.

### Argument schemas via `ellmer::type_*`

Tools that take arguments use
[`ellmer::type_string()`](https://ellmer.tidyverse.org/reference/type_boolean.html)
for the schema. We do not invent our own argument-validation layer —
ellmer hands the schema to the model and routes the call. If a bad
argument arrives, the tool’s own checks (e.g. “is `id` in
[`board_block_ids()`](https://bristolmyerssquibb.github.io/blockr.core/reference/board_blocks.html)?”)
surface the error, which is returned as a structured error string (see
*Error formatting* below).

## Tool catalogue

Each entry below lists the tool name, the description shown to the
model, the argument schema, and the return shape.

### `list_blocks`

- **Description.** “List all blocks on the board. Returns a data frame
  with one row per block: `id`, `type`, `name`, `package`.”
- **Arguments.** none.
- **Returns.** A data.frame with columns `id`, `type`, `name`,
  `package`. `type` is `class(block)[[1L]]`; `name` and `package` come
  from `block_metadata(block)` /
  [`registry_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/register_block.html).

### `describe_block`

- **Scope.** Board blocks only — i.e. blocks currently mounted on the
  board. For *registry* block types (block constructors the user could
  add but hasn’t), all available metadata is already surfaced
  row-per-type in `list_available_blocks`, so a separate registry-side
  describe tool would be redundant.
- **Description.** “Describe a block currently on the board: its
  constructor name, current parameter values, whether it is externally
  controllable, and which other blocks feed into it.”
- **Arguments.**
  `id = ellmer::type_string("Block id, as returned by list_blocks.")`.
- **Returns.** A character scalar of multi-line text (the model sees a
  newline-joined string). The tool’s implementation looks the block up
  on `board$blocks`, delegates to the exported
  `describe_block(block, board, id)` S3 generic — which returns a
  character vector of lines — and collapses it with
  `paste(..., collapse = "\n")` before returning to ellmer. The default
  method `describe_block.block` produces the description from the
  registry’s generic metadata plus the live instance state (current arg
  values, external-control flag, incoming links). Block authors override
  `describe_block.<their_block_class>` when the generic output is
  insufficient. Pre-formatted prose works better for the model than a
  nested list, because the description mixes structured fields with
  free-form values.

### `list_links`

- **Description.** “List all links between blocks: each row gives the
  link id, source block, destination block, and which input on the
  destination is being fed.”
- **Arguments.** none.
- **Returns.** `as.data.frame(board_links(board$board))` — columns `id`,
  `from`, `to`, `input`.

### `list_stacks`

- **Description.** “List all stacks on the board. Each stack groups
  blocks under a name; returns one row per stack with id, name,
  comma-separated block ids, and a class-specific description.”
- **Arguments.** none.
- **Returns.** A data.frame with columns `id`, `name`, `blocks`,
  `description`. The first three come from `board_stacks(board)` /
  `stack_blocks(s)`. `description` is
  `paste(describe_stack(stack), collapse = "\n")` for each stack,
  dispatched on the stack’s class; the default `describe_stack.stack`
  returns a short summary, and stack-class extensions (e.g.
  `blockr.dag::dag_stack`) override their class to add their own fields
  (colour, layout, …). Methods return a character vector of lines; the
  tool collapses to a single string per row.

### `list_available_blocks`

- **Description.** “List every registered block constructor — block
  types the user can add to the board. One row per type with id, name,
  package, category, description, and the constructor’s argument
  descriptions.”
- **Arguments.** none.
- **Returns.** A data.frame with columns `id`, `name`, `package`,
  `category`, `description`, `arguments` (list-column whose entries are
  the named arg-name → description lists from
  `registry_metadata(..., "arguments")`). The `id` column is the
  registry uid that `add_block` will accept in Phase 4.
- **Rationale for skipping a `describe_available_block` tool.**
  Everything
  [`registry_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/register_block.html)
  knows about a registered type is static and bounded — name,
  description, category, package, argument descriptions — and fits in
  one row. Splitting an enumeration tool from a detail tool the way
  `list_blocks` / `describe_block` are split would buy us nothing: there
  is no “runtime state” for an unmounted block type, and the per-row
  payload here is comparable in size to a `describe_block` response. One
  tool, one round-trip.

This is the one tool whose return value is fully determined by the
package-load-time state of the block registry, with no dependency on
`board`. We still build it through the same factory shape for
uniformity.

### `get_block_result`

- **Description.** “Return a short text summary of a block’s current
  evaluated output. Data frames are summarised with skimr-style stats;
  other objects fall back to a truncated print. Returns an error string
  if the block has not evaluated successfully.”
- **Arguments.**
  `id = ellmer::type_string("Block id, as returned by list_blocks.")`.
- **Returns.** Character scalar — the concatenated output of
  `summarise_result(result)`. See *Result summarisation via
  `summarise_result()`* above for the generic and its default.

## System prompt revision

The Phase 1 prompt ends with “Do not invent tool calls or claim to have
changed the board — you cannot, yet.” Phase 2 replaces the prompt with
one that names the new toolkit explicitly:

    You are an assistant embedded next to a blockr data analysis board.
    You have a set of inspection tools that let you read the board's
    current state: list_blocks, describe_block, list_links, list_stacks,
    list_available_blocks, and get_block_result. Prefer
    calling a tool over guessing when the user asks about the board. You
    cannot modify the board yet; future versions will add tools for
    that. When you call a tool, wait for its result before continuing
    your reply.

The list of tools is hard-coded into the prompt. We deliberately do
*not* introduce dynamic prompt templating here — Phase 5 owns that. If a
tool is added or removed between phases, updating this string is one
find-and-replace.

## Implementation sketch

### `describe_block()` generic — `R/describe-block.R`

``` r

#' Describe a block for the LLM
#'
#' Generic backing the `describe_block` assistant tool. The default
#' method `describe_block.block` reports the block's constructor
#' name, current parameter values, external-control flag, and
#' incoming links from the registry's generic block metadata. Block
#' authors override their class when the default isn't enough.
#'
#' @param x A `block`.
#' @param board The current board snapshot, for resolving link
#'   metadata.
#' @param id The id under which the block lives on the board (the
#'   name attribute of the enclosing `blocks` object — block objects
#'   themselves do not carry an id because ids must be unique while
#'   block-level fields are user-supplied and need not be).
#' @param ... For future use.
#' @return Character vector of lines (consistent with
#'   [summarise_result()] and [describe_stack()]). The tool that
#'   consumes this collapses with `paste(..., collapse = "\n")`
#'   before returning to ellmer.
#' @export
describe_block <- function(x, board, id, ...) UseMethod("describe_block")

#' @rdname describe_block
#' @export
describe_block.block <- function(x, board, id, ...) {

  meta <- block_metadata(x)
  args <- initial_block_state(x)
  ctrl <- block_external_ctrl_vars(x)
  inc  <- board_links(board)[board_links(board)$to == id, ]

  c(
    sprintf("Block %s (%s, from %s)", id, meta$name, meta$package),
    sprintf("  %s", meta$description),
    "",
    "Arguments:",
    if (length(args)) {
      chr_ply(
        names(args),
        function(nm) sprintf("  %s: %s", nm, format(args[[nm]]))
      )
    } else {
      "  (none)"
    },
    "",
    sprintf(
      "External control: %s",
      if (!length(ctrl)) "no" else paste(ctrl, collapse = ", ")
    ),
    "",
    "Incoming links:",
    if (nrow(inc)) {
      chr_ply(
        seq_len(nrow(inc)),
        function(i) sprintf("  %s <- %s (input: %s)",
                            inc$id[i], inc$from[i], inc$input[i])
      )
    } else {
      "  (none)"
    }
  )
}
```

### `describe_stack()` generic — `R/describe-stack.R`

``` r

#' Describe a stack for the LLM
#'
#' Generic backing the `description` column of the `list_stacks`
#' tool. The default method `describe_stack.stack` summarises the
#' base stack fields (id, name, comma-separated blocks). Stack
#' classes that carry extra attributes (e.g. `blockr.dag::dag_stack`
#' with a colour) override their class to surface those attributes.
#'
#' @param x A `stack`.
#' @param ... For future use.
#' @return Character vector of lines (consistent with
#'   [summarise_result()] and [describe_block()]). The tool that
#'   consumes this collapses with `paste(..., collapse = "\n")`
#'   before returning to ellmer.
#' @export
describe_stack <- function(x, ...) UseMethod("describe_stack")

#' @rdname describe_stack
#' @export
describe_stack.stack <- function(x, ...) {
  sprintf(
    "stack '%s' (blocks: %s)",
    stack_name(x) %||% "<unnamed>",
    paste(stack_blocks(x), collapse = ", ")
  )
}
```

### Tool factories — `R/tools-read.R`

``` r

register_read_tools <- function(client, board, update, session) {

  client$register_tool(tool_list_blocks(board, update, session))
  client$register_tool(tool_describe_block(board, update, session))
  client$register_tool(tool_list_links(board, update, session))
  client$register_tool(tool_list_stacks(board, update, session))
  client$register_tool(
    tool_list_available_blocks(board, update, session)
  )
  client$register_tool(
    tool_get_block_result(board, update, session)
  )

  invisible(client)
}

with_tool_errors <- function(name, expr) {

  tryCatch(
    expr,
    error = function(e) {
      sprintf("%s failed: %s", name, conditionMessage(e))
    }
  )
}

tool_list_blocks <- function(board, update, session) {

  ellmer::tool(
    function() with_tool_errors("list_blocks", {

      b <- isolate(board$board)
      ids <- board_block_ids(b)

      if (!length(ids)) {
        return(
          data.frame(
            id      = character(),
            type    = character(),
            name    = character(),
            package = character()
          )
        )
      }

      blks <- board_blocks(b)
      meta <- lapply(blks, block_metadata)

      data.frame(
        id      = ids,
        type    = chr_ply(blks, function(x) class(x)[[1L]]),
        name    = chr_xtr(meta, "name"),
        package = chr_xtr(meta, "package"),
        row.names = NULL
      )
    }),
    name        = "list_blocks",
    description = "List all blocks on the board with id, type, name, package.",
    arguments   = list()
  )
}

tool_describe_block <- function(board, update, session) {

  ellmer::tool(
    function(id) with_tool_errors("describe_block", {

      brd <- isolate(board$board)
      blks <- board_blocks(brd)
      if (!id %in% names(blks)) {
        return(sprintf(
          "No block with id %s. Call list_blocks first.", id
        ))
      }

      paste(
        describe_block(blks[[id]], board = brd, id = id),
        collapse = "\n"
      )
    }),
    name        = "describe_block",
    description = "Describe a block in detail: constructor, args, external_ctrl, incoming links.",
    arguments   = list(
      id = ellmer::type_string("Block id, as returned by list_blocks.")
    )
  )
}

tool_list_stacks <- function(board, update, session) {

  ellmer::tool(
    function() with_tool_errors("list_stacks", {

      stks <- board_stacks(isolate(board$board))
      if (!length(stks)) {
        return(
          data.frame(
            id          = character(),
            name        = character(),
            blocks      = character(),
            description = character()
          )
        )
      }

      data.frame(
        id          = names(stks),
        name        = chr_ply(stks, function(s) stack_name(s) %||% NA_character_),
        blocks      = chr_ply(stks, function(s) paste(stack_blocks(s), collapse = ", ")),
        description = chr_ply(stks, function(s) {
          paste(describe_stack(s), collapse = "\n")
        }),
        row.names   = NULL
      )
    }),
    name        = "list_stacks",
    description = "List all stacks with id, name, blocks, and a class-specific description.",
    arguments   = list()
  )
}

# list_links, list_available_blocks, and
# get_block_result follow the same skeleton.
```

### Extension server diff

``` r

asst_ext_srv <- function(system_prompt, messages) {

  function(id, board, update, ...) {

    moduleServer(
      id,
      function(input, output, session) {

        chat_ctor <- get_board_option_value("llm_model", session)
        sys_prompt <- coal(system_prompt, default_system_prompt())

        client <- chat_ctor(system_prompt = sys_prompt)

        register_read_tools(client, board, update, session)         # new

        if (length(messages)) {
          client$set_turns(lapply(messages, ellmer::contents_replay))
        }

        # ... unchanged from Phase 1 ...
      }
    )
  }
}
```

Tool registration happens *after* the client is built and *before*
`set_turns()`, so a restored conversation that referenced these tools
resolves them correctly when replayed.

## Error formatting

Tools return errors as plain prose strings so the model can self-correct
rather than seeing an opaque crash. Two layers:

- **Argument-level errors** (unknown block id, unknown stack id) return
  a short factual sentence pointing the model at the right discovery
  tool — e.g. “No block with id X. Call list_blocks first.” These are
  deliberate early returns, not exceptions.
- **Implementation-level errors** (a
  [`block_metadata()`](https://bristolmyerssquibb.github.io/blockr.core/reference/block_name.html)
  call throws, a custom `describe_block.<class>` method errors out, a
  `summarise_result` override raises) are caught by the internal helper
  `with_tool_errors(name, expr)` that wraps every tool body in a
  `tryCatch`. The handler translates the error to
  `"<tool_name> failed: <conditionMessage(e)>"`.

Tools may also catch *specific* error conditions inline when the
condition needs a distinctive message — e.g. `get_block_result`’s inner
`tryCatch` around `result()` flags “block X has not evaluated
successfully” rather than just generic-tool-failure. Those inline
catches live *inside* `with_tool_errors`, so anything they don’t
explicitly handle still hits the outer catch-all.

The format is plain text, not a JSON envelope: the model already treats
tool returns as text, and a structured-error type would have to be
designed before Phase 4 mutations even arrive. Phase 4 will revisit this
when mutation errors carry structured payloads (e.g. “validation failed
on link {id}: cycle detected”).

## Files added / changed

- `R/describe-block.R` *(new)* —
  [`describe_block()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_block.md)
  generic and default method on `block` operating on registry metadata.
- `R/describe-stack.R` *(new)* —
  [`describe_stack()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/describe_stack.md)
  generic and default method on `stack` returning a short id/name/blocks
  summary.
- `R/summarise-result.R` *(new)* — `summarise_result()` generic and
  default method forwarding to
  [`btw::btw_this()`](https://posit-dev.github.io/btw/reference/btw_this.html).
- `R/tools-read.R` *(new)* — six tool factories plus
  `register_read_tools()`.
- `R/extension.R` — one new line calling `register_read_tools()` after
  the chat client is built.
- `R/system-prompt.R` —
  [`default_system_prompt()`](https://bristolmyerssquibb.github.io/blockr.assistant/reference/default_system_prompt.md)
  text revised.
- `DESCRIPTION` — add `btw` to `Imports:`.
- `NAMESPACE` — export `describe_block`, `describe_stack`,
  `summarise_result` plus their default methods.
- `inst/examples/populated-board/app.R` *(new)* —
  `dataset_block("iris")` → `subset_block`, the assistant extension
  mounted alongside.
- `tests/testthat/test-describe-block.R` *(new)* — default method on a
  synthetic block; an override on a fake block subclass is honoured.
- `tests/testthat/test-describe-stack.R` *(new)* — default method on a
  synthetic stack; an override on a fake stack subclass (mirroring
  `dag_stack`) surfaces in the `list_stacks` rows.
- `tests/testthat/test-summarise-result.R` *(new)* — default dispatches
  to `btw_this` for a data.frame and a non-tabular object; a per-test S3
  method on a fake class is honoured.
- `tests/testthat/test-tools-read.R` *(new)* — one
  [`testthat::describe()`](https://testthat.r-lib.org/reference/describe.html)
  per tool: happy path against a fake board, plus a failure path
  (unknown id, empty board).

## Acceptance criteria

### Automated (CI / `devtools::check()`)

- All six built-in tools registered on the chat client at
  extension-server start, verifiable by `length(client$get_tools())`
  inside a
  [`shiny::testServer()`](https://rdrr.io/pkg/shiny/man/testServer.html)
  harness.
- An override of `describe_block.<fake_block_class>` is reached when the
  corresponding block is on the board — proves the per-block generic
  surface.
- An override of `describe_stack.<fake_stack_class>` appears in the
  `description` column of `list_stacks` — proves the per-stack generic
  surface.
- Each tool’s R-level implementation tested in isolation against a
  static board fixture; `get_block_result` tested via
  [`shiny::testServer()`](https://rdrr.io/pkg/shiny/man/testServer.html)
  because it needs a reactive context.
- `devtools::check()` passes 0/0/0.
- Phase 1 acceptance criteria still pass: ser/des round-trip, streaming,
  stop button, token telemetry — adding tools must not regress
  conversational behaviour.

### Manual (demo app, live LLM)

These can’t be exercised in CI — they need a real chat backend. They are
the gate before merge, not before CI green.

- Demo app launches without errors against the `default_chat` fallback.
- User asks “what blocks are on the board?” → model invokes
  `list_blocks` and replies with the actual block ids.
- User asks “what does block X do?” → model invokes `describe_block` and
  replies with constructor args and current values.
- User asks “what does the result of X look like?” → model invokes
  `get_block_result` and returns a `summarise_result()` summary.

## Known limitations carried into later phases

- No staging. Every tool reads `board$board` / `board$blocks` directly;
  this is fine for read-only tools but is the explicit motivation for
  Phase 3’s pending-update layer.
- No dynamic board context in the system prompt. The model only sees the
  board when it explicitly calls a tool. Phase 5 will add a board
  summary so the model can answer trivial “how many blocks?” questions
  without a tool round-trip.
- The tool list is hard-coded into the system prompt. Generating it from
  `register_read_tools()` is a Phase 5 concern.
- No tool-contribution API for sibling dock extensions; see \#4 and the
  upstream prerequisite at `blockr.dock#129`.
- `btw` is added to `Imports`. If lighter alternatives appear that cover
  the same generic-summary surface, this is cheap to swap.
