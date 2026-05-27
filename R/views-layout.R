#' Layout JSON spec form
#'
#' Stable mapping between a `dock_layout` and a JSON-friendly R
#' structure -- the spec form that crosses the assistant <-> tool
#' boundary. Mirrors (and is the inverse of)
#' `blockr.dock::as_layout_spec()`:
#'
#' - bare ID string -> scalar string
#' - tabbed leaf, default active (first) -> array of strings
#' - `panels(..., active = ...)` -> object with `panels` and `active`
#' - `group(..., sizes = c(...))` -> object with `group` and `sizes`
#' - top-level `dock_layout(..., orientation, sizes, active_group)`
#'   -> object with `children` (array), `orientation`, optional `sizes`,
#'   and `active_group`
#'
#' Round-trips: `layout_from_spec(layout_to_spec(ly))` is equivalent
#' to `ly` for any `dock_layout`.
#'
#' @noRd
NULL

strip_panel_prefix <- function(x) {

  if (is.null(x)) {
    return(x)
  }

  sub("^(block_panel|ext_panel)-", "", x)
}

is_even_sizes <- function(sizes) {

  length(sizes) <= 1L ||
    all(is.na(sizes)) ||
    all(abs(sizes - mean(sizes)) < 1e-9)
}

node_to_spec <- function(node) {

  if (identical(node[["type"]], "leaf")) {

    views <- strip_panel_prefix(
      unlist(node[["data"]][["views"]], use.names = FALSE)
    )
    active <- strip_panel_prefix(node[["data"]][["activeView"]])

    if (length(views) == 1L) {
      return(views[[1L]])
    }

    if (identical(active, views[[1L]])) {
      return(as.list(views))
    }

    return(
      list(panels = as.list(views), active = active)
    )
  }

  children <- lapply(node[["data"]], node_to_spec)

  sizes <- vapply(
    node[["data"]],
    function(x) x[["size"]] %||% NA_real_,
    numeric(1L)
  )

  if (is_even_sizes(sizes)) {
    return(list(group = children))
  }

  list(group = children, sizes = sizes)
}

layout_to_spec <- function(layout) {

  stopifnot(is_dock_layout(layout))

  root <- layout[["grid"]][["root"]]
  active_group <- layout[["activeGroup"]] %||% "1"

  if (is.null(root) || !length(root)) {

    return(
      list(
        children     = list(),
        orientation  = "horizontal",
        active_group = active_group
      )
    )
  }

  if (identical(root[["type"]], "branch")) {

    children <- lapply(root[["data"]], node_to_spec)

    sizes <- vapply(
      root[["data"]],
      function(x) x[["size"]] %||% NA_real_,
      numeric(1L)
    )

    top_sizes <- if (is_even_sizes(sizes)) NULL else sizes

  } else {

    children  <- list(node_to_spec(root))
    top_sizes <- NULL
  }

  out <- list(
    children     = children,
    orientation  = tolower(layout[["grid"]][["orientation"]] %||% "horizontal"),
    active_group = active_group
  )

  if (!is.null(top_sizes)) {
    out[["sizes"]] <- top_sizes
  }

  out
}

spec_abort <- function(reason) {
  stop("layout JSON: ", reason, call. = FALSE)
}

coerce_sizes <- function(x, where) {

  if (is.null(x)) {
    return(NULL)
  }

  nums <- suppressWarnings(as.numeric(unlist(x)))

  if (any(is.na(nums))) {
    spec_abort(
      sprintf("%s: `sizes` must be an array of numbers", where)
    )
  }

  nums
}

spec_to_node <- function(x) {

  if (is.character(x) && length(x) == 1L) {
    return(x)
  }

  if (is.character(x)) {
    return(do.call(panels, as.list(x)))
  }

  if (!is.list(x)) {
    spec_abort(
      sprintf("expected string, array or object; got %s", class(x)[[1L]])
    )
  }

  nms <- names(x)

  if (is.null(nms) || !any(nzchar(nms))) {

    all_strings <- all(
      vapply(
        x,
        function(e) is.character(e) && length(e) == 1L,
        logical(1L)
      )
    )

    if (all_strings) {
      return(do.call(panels, as.list(unlist(x))))
    }

    spec_abort(
      paste(
        "an unnamed array can only hold panel IDs (tab leaf).",
        "For a nested split, use `{\"group\": [<node>, ...]}` --",
        "optionally with `\"sizes\": [...]`."
      )
    )
  }

  if ("panels" %in% nms) {

    if (!is.null(x[["group"]]) || !is.null(x[["children"]])) {
      spec_abort(
        "`panels` cannot be combined with `group` or `children`"
      )
    }

    extra <- setdiff(nms, c("panels", "active"))

    if (length(extra)) {
      spec_abort(
        sprintf(
          "unknown keys for panels object: %s",
          paste(extra, collapse = ", ")
        )
      )
    }

    ids <- as.list(unlist(x[["panels"]]))

    if (is.null(x[["active"]])) {
      return(do.call(panels, ids))
    }

    return(
      do.call(panels, c(ids, list(active = x[["active"]])))
    )
  }

  if ("group" %in% nms) {

    if (!is.null(x[["panels"]]) || !is.null(x[["children"]])) {
      spec_abort(
        "`group` cannot be combined with `panels` or `children`"
      )
    }

    extra <- setdiff(nms, c("group", "sizes"))

    if (length(extra)) {
      spec_abort(
        sprintf(
          "unknown keys for group object: %s",
          paste(extra, collapse = ", ")
        )
      )
    }

    children <- lapply(x[["group"]], spec_to_node)
    sizes    <- coerce_sizes(x[["sizes"]], "group")

    if (is.null(sizes)) {
      return(do.call(group, children))
    }

    return(
      do.call(group, c(children, list(sizes = sizes)))
    )
  }

  if ("children" %in% nms) {
    spec_abort(
      paste(
        "`children` is only valid at the top level of a layout;",
        "use `group` (with optional `sizes`) for a nested split, or",
        "an array of strings / `panels` object for a tabbed leaf.",
        "Inner branches alternate orientation with depth automatically",
        "-- there is no per-branch `orientation` key."
      )
    )
  }

  spec_abort(
    sprintf(
      paste(
        "object must have `panels` or `group`; got keys: %s"
      ),
      paste(nms, collapse = ", ")
    )
  )
}

layout_from_spec <- function(parsed) {

  if (!is.list(parsed)) {
    spec_abort("top-level must be an object")
  }

  if (!"children" %in% names(parsed)) {
    spec_abort("top-level object requires `children`")
  }

  extra <- setdiff(
    names(parsed),
    c("children", "orientation", "sizes", "active_group", "active")
  )

  if (length(extra)) {
    spec_abort(
      sprintf(
        "unknown top-level keys: %s", paste(extra, collapse = ", ")
      )
    )
  }

  children <- lapply(parsed[["children"]], spec_to_node)

  orientation <- parsed[["orientation"]] %||% "horizontal"

  args <- c(children, list(orientation = orientation))

  sizes <- coerce_sizes(parsed[["sizes"]], "top-level")

  if (!is.null(sizes)) {
    args[["sizes"]] <- sizes
  }

  result <- do.call(dock_layout, args)

  if (!is.null(parsed[["active_group"]])) {
    result[["activeGroup"]] <- parsed[["active_group"]]
  }

  result
}

parse_layout_json <- function(s) {

  if (!nzchar(s)) {
    stop("`layout` is empty", call. = FALSE)
  }

  parsed <- tryCatch(
    jsonlite::fromJSON(s, simplifyVector = FALSE),
    error = function(e) {
      stop(
        "layout JSON parse failed: ", conditionMessage(e),
        call. = FALSE
      )
    }
  )

  layout_from_spec(parsed)
}
