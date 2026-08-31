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
