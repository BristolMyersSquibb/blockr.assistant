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

  panels <- panel_obj_ids(layout_panel_ids(x))

  panels_str <- if (length(panels)) {
    paste(panels, collapse = ", ")
  } else {
    "<empty>"
  }

  sprintf("(%d panel(s): %s)", length(panels), panels_str)
}
