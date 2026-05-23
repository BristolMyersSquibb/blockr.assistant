#' Summarise a stack for the LLM prompt context
#'
#' Generic backing the per-stack lines in the dynamic system
#' prompt's board summary. The default method
#' `summarise_stack.stack` returns a compact name + member-blocks
#' line. Stack classes that carry extra attributes (e.g.
#' `blockr.dag::dag_stack` with a colour) override their class
#' to surface those attributes.
#'
#' Parallel to [describe_stack()] (full description, used by the
#' `list_stacks` tool's description column). Use
#' `summarise_stack` when token density matters.
#'
#' @param x A `stack`.
#' @param ... For future use.
#'
#' @return A single-line character scalar (preferred). The
#'   caller in `summarise_board()` prepends the stack's id.
#'
#' @export
summarise_stack <- function(x, ...) {
  UseMethod("summarise_stack")
}

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
