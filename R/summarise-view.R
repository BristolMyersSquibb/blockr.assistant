#' Summarise a view for the LLM prompt context
#'
#' Generic backing the per-view lines in the dynamic system
#' prompt's board summary. The default method
#' `summarise_view.dock_layout` returns a compact line listing the
#' view's panel count and active panel. Custom layout classes can
#' override to surface class-specific attributes.
#'
#' @param x A `dock_layout`.
#' @param ... For future use.
#'
#' @return A single-line character scalar. The caller in
#'   `summarise_board()` prepends the view name and active marker.
#'
#' @export
summarise_view <- function(x, ...) {
  UseMethod("summarise_view")
}

#' @rdname summarise_view
#' @export
summarise_view.dock_layout <- function(x, ...) {

  wire <- layout_to_wire(x)

  panels <- collect_panel_ids(wire$children)

  panels_str <- if (length(panels)) {
    paste(panels, collapse = ", ")
  } else {
    "<empty>"
  }

  sprintf("(%d panel(s): %s)", length(panels), panels_str)
}

collect_panel_ids <- function(node) {

  if (is.character(node)) {
    return(node)
  }

  if (is.list(node) && is.null(names(node))) {
    return(unlist(lapply(node, collect_panel_ids), use.names = FALSE))
  }

  if (is.list(node)) {

    if (!is.null(node$panels)) {
      return(unlist(node$panels, use.names = FALSE))
    }

    if (!is.null(node$group)) {
      return(
        unlist(lapply(node$group, collect_panel_ids), use.names = FALSE)
      )
    }

    if (!is.null(node$children)) {
      return(
        unlist(
          lapply(node$children, collect_panel_ids),
          use.names = FALSE
        )
      )
    }
  }

  character()
}
