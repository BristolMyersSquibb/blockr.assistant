#' Describe a block for the LLM
#'
#' Generic backing the `describe_block` assistant tool. The default
#' method `describe_block.block` reports the block's class, name,
#' arguments, external-control declaration, and incoming links. The
#' bulk of the description comes from [base::format()] on the block;
#' incoming links are computed from the board snapshot supplied
#' alongside. Block authors override their class when the default
#' isn't enough.
#'
#' @param x A `block`.
#' @param board The current board snapshot, for resolving link
#'   metadata.
#' @param id The id under which the block lives on the board (the
#'   name attribute of the enclosing `blocks` object -- block
#'   objects themselves do not carry an id because ids must be
#'   unique while block-level fields are user-supplied and need not
#'   be).
#' @param ... Passed on to methods.
#' @param state Live block state as a named list covering the block's
#'   constructor inputs, rendered in place of the values the block was
#'   constructed with. The block object carries only its constructor
#'   frame, which is fixed at construction, so the `NULL` default
#'   reports load-time values however long ago a commit or an edit in
#'   the block's own UI moved them on.
#'
#' @return Character vector of lines (consistent with
#'   `summarise_result()` and [describe_stack()]). The tool that
#'   consumes this collapses with `paste(..., collapse = "\n")`
#'   before returning to ellmer.
#'
#' @export
describe_block <- function(x, board, id, ..., state = NULL) {
  UseMethod("describe_block")
}

#' @rdname describe_block
#' @export
describe_block.block <- function(x, board, id, ..., state = NULL) {

  core <- format(x, state = state)

  ctrl <- external_ctrl_vars(x)

  ctrl_desc <- if (identical(ctrl, "block_name")) {
    "block_name only"
  } else {
    paste(ctrl, collapse = ", ")
  }

  ctrl_line <- glue::glue("Modifiable via modify_block: {ctrl_desc}")

  links <- board_links(board)
  inc <- links[links$to == id]

  inc_lines <- if (length(inc)) {
    c(
      "Incoming links:",
      chr_ply(
        seq_along(inc),
        function(i) {
          glue::glue(
            "  {inc$id[[i]]} <- {inc$from[[i]]} (input: {inc$input[[i]]})"
          )
        }
      )
    )
  } else {
    "Incoming links: (none)"
  }

  c(
    glue::glue("Block id: {id}"),
    core,
    ctrl_line,
    inc_lines
  )
}

# Core keys block state by exactly the constructor inputs, so what comes back
# always covers what format() needs. A block that never constructed is absent
# from `board$blocks` and chains to NULL; a `dormant` one still holds correct
# state, its result being the part deferral makes unreadable.
live_block_state <- function(id, board) {

  state <- isolate(board$blocks[[id]]$server$state)

  if (!length(state)) {
    return(NULL)
  }

  isolate(lapply(state, reval_if))
}

# What a *summary* of block state shows: live state with any value str() would
# cut replaced outright. Both summary surfaces -- describe_block's state
# section and the post-commit read-back -- render state through str(), which
# cuts a character value at 128 chars and marks the cut with its own
# `| __truncated__`: not our marker vocabulary, and naming no tool. A long
# `script` or filter expression therefore arrives looking like a complete short
# value, and since modify_block replaces the whole value, a model that reads
# short writes short. Dropping the value leaves nothing to act on and names the
# tier that has it.
summary_block_state <- function(id, board) {

  state <- live_block_state(id, board)

  if (is.null(state)) {
    return(NULL)
  }

  elide_long_values(state)
}

# One wording for all three sites that point at the detail tier -- the elision
# marker and both summary truncations. They drifted apart the moment they were
# written separately.
state_tool_hint <- function() {
  "call get_block_state for the full argument values"
}

# Length is measured on the escaped rendering, because that is what str() cuts
# on: a value of 120 source characters carrying quotes or newlines escapes past
# 128 and is truncated, so counting source characters would let through exactly
# the values this exists for.
elide_long_values <- function(state, hint = state_tool_hint(),
                              max_chars = state_value_max_chars()) {

  map_state_values(state, function(x) {

    if (!is.character(x)) {
      return(x)
    }

    long <- !is.na(x) & nchar(encodeString(x, quote = "\"")) > max_chars

    x[long] <- paste0("[", nchar(x[long]), " chars omitted -- ", hint, "]")

    x
  })
}

# The one traversal both tiers share. A bare list is a container to recurse
# into; a classed one -- a data frame a static block was handed -- is a leaf,
# because lapply()ing it would strip the class and rewrite its columns (which
# is also why base rapply() cannot serve here). Written once so that rule
# cannot be corrected in one tier and left wrong in the other.
map_state_values <- function(state, f) {

  walk <- function(x) {

    if (is.list(x) && !is.object(x)) {
      return(lapply(x, walk))
    }

    f(x)
  }

  lapply(state, walk)
}

# The detail tier's rendering: values as the board holds them rather than as
# str() renders them, so a long argument arrives whole and can be edited and
# written back. Still bounded, by one budget spent across the values in order
# rather than a bound each -- a block with five long arguments costs the same
# ceiling as a block with one.
bound_state_values <- function(state, max_chars = state_max_chars()) {

  budget <- max_chars

  charge <- function(txt) {

    out <- truncate_chars(txt, max(0L, budget))
    budget <<- budget - nchar(out)

    out
  }

  spend <- function(x) {

    if (is.character(x)) {

      for (i in seq_along(x)) {
        if (!is.na(x[[i]])) {
          x[[i]] <- charge(x[[i]])
        }
      }

      return(x)
    }

    # An atomic value the budget can afford stays raw, so the model reads back
    # exactly the shape modify_block takes. Anything larger -- a data frame a
    # static block was handed, a function -- becomes the compact str() line
    # describe_block already shows, JSON carrying such a value no better.
    rendered <- paste(str_lines(x), collapse = "\n")

    if (!is.object(x) && is.atomic(x) && nchar(rendered) <= budget) {
      budget <<- budget - nchar(rendered)
      return(x)
    }

    charge(rendered)
  }

  map_state_values(state, spend)
}

# Core renders block state with str(), so rendering it the same way anywhere
# else means the model meets a block's arguments in one shape wherever it
# reads them. Dropping the "List of n" header is the caller's business.
str_lines <- function(x) {
  trimws(capture.output(str(x)), "right")
}
