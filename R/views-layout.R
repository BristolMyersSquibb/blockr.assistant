#' Layout JSON for the assistant <-> tool boundary
#'
#' The wire format is owned by blockr.dock: `layout_from_json()` parses
#' a JSON layout (or parsed spec list) into a `dock_layout`, and
#' `layout_to_json()` / `as.list()` render one back out. The tools speak
#' that format directly; the only assistant-side concern is panel-ID
#' surface. Blocks and extensions are referenced by bare ID everywhere
#' else the model looks (list_blocks, the board summary), so view
#' layouts use bare IDs too. dock resolves bare IDs to canonical
#' `block_panel-` / `ext_panel-` form on the way in (via
#' `layout_from_json()` at flush) and exposes the inverse as
#' `panel_obj_ids()`, which is all `layout_to_llm_spec()` needs on the
#' way out.
#'
#' @noRd
layout_to_llm_spec <- function(layout) {
  strip_panel_ids(as.list(layout))
}

strip_panel_ids <- function(node) {

  if (is.character(node)) {
    return(panel_obj_ids(node))
  }

  if (!is.list(node)) {
    return(node)
  }

  if (!is.null(node[["panels"]])) {

    node[["panels"]] <- as.list(panel_obj_ids(unlist(node[["panels"]])))

    if (!is.null(node[["active"]])) {
      node[["active"]] <- panel_obj_ids(node[["active"]])
    }

    return(node)
  }

  if (!is.null(node[["children"]])) {

    node[["children"]] <- lapply(node[["children"]], strip_panel_ids)

    if (!is.null(node[["focus"]])) {
      node[["focus"]] <- panel_obj_ids(node[["focus"]])
    }

    return(node)
  }

  node
}
