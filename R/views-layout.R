# The wire format for view layouts at the assistant <-> tool boundary. The
# model speaks a compact nested-layout JSON, owned here: an object with an
# `orientation`, `children`, optional `sizes` and `focus`; each child is a
# bare panel-id leaf, a `{panels, active}` tab group, or a nested
# `{children, sizes}` split. Blocks and extensions are named by bare id
# everywhere the model looks, so layouts use bare ids too. `layout_from_json()`
# parses that into a blockr.dock `dock_grid`, resolving each bare id to its
# canonical `block_panel-` / `ext_panel-` form; `layout_to_llm_spec()` is the
# inverse, collapsing single-panel leaves and even splits back to the compact
# form and stripping the prefixes with `panel_obj_ids()`.

layout_from_json <- function(json, block_ids = character(),
                             ext_ids = character()) {

  spec <- if (is.character(json)) {
    jsonlite::fromJSON(json, simplifyVector = FALSE)
  } else {
    json
  }

  as_dock_grid(
    list(
      orientation = coal(spec[["orientation"]], "horizontal", fail_all = FALSE),
      children = lapply(
        spec[["children"]], resolve_layout_node, block_ids, ext_ids
      ),
      sizes = as_grid_sizes(spec[["sizes"]]),
      focus = resolve_panel_id(spec[["focus"]], block_ids, ext_ids)
    )
  )
}

resolve_layout_node <- function(node, block_ids, ext_ids) {

  if (is.character(node)) {
    id <- resolve_panel_id(node, block_ids, ext_ids)
    return(list(panels = id, active = id))
  }

  if (not_null(node[["panels"]])) {

    ids <- chr_ply(as.character(unlst(node[["panels"]])), resolve_panel_id,
                   block_ids, ext_ids)

    active <- coal(
      resolve_panel_id(node[["active"]], block_ids, ext_ids),
      ids[[1L]],
      fail_all = FALSE
    )

    return(list(panels = ids, active = active))
  }

  if (is.null(node[["children"]])) {
    stop(
      "each layout node must be a string or an object with `panels` ",
      "or `children`",
      call. = FALSE
    )
  }

  list(
    children = lapply(
      node[["children"]], resolve_layout_node, block_ids, ext_ids
    ),
    sizes = as_grid_sizes(node[["sizes"]])
  )
}

resolve_panel_id <- function(id, block_ids, ext_ids) {

  if (is.null(id)) {
    return(NULL)
  }

  if (grepl("^(block_panel-|ext_panel-)", id)) {
    return(id)
  }

  if (id %in% ext_ids) {
    as.character(as_ext_panel_id(id))
  } else {
    as.character(as_block_panel_id(id))
  }
}

as_grid_sizes <- function(sizes) {
  if (is.null(sizes)) NULL else as.numeric(unlst(sizes))
}

layout_to_llm_spec <- function(layout) {

  grid <- as.list(layout)

  spec <- list(
    orientation = coal(grid[["orientation"]], "horizontal", fail_all = FALSE),
    children = lapply(grid[["children"]], layout_node_to_spec)
  )

  sizes <- non_even_sizes(grid[["sizes"]], length(grid[["children"]]))

  if (not_null(sizes)) {
    spec[["sizes"]] <- sizes
  }

  if (not_null(grid[["focus"]])) {
    spec[["focus"]] <- panel_obj_ids(grid[["focus"]])
  }

  spec
}

layout_node_to_spec <- function(node) {

  if (not_null(node[["panels"]])) {

    ids <- panel_obj_ids(as.character(unlst(node[["panels"]])))

    if (length(ids) == 1L) {
      return(ids)
    }

    return(
      list(panels = as.list(ids), active = panel_obj_ids(node[["active"]]))
    )
  }

  spec <- list(children = lapply(node[["children"]], layout_node_to_spec))

  sizes <- non_even_sizes(node[["sizes"]], length(node[["children"]]))

  if (not_null(sizes)) {
    spec[["sizes"]] <- sizes
  }

  spec
}

non_even_sizes <- function(sizes, n) {

  if (!length(sizes) || n < 2L) {
    return(NULL)
  }

  if (isTRUE(all.equal(as.numeric(sizes), rep(1 / n, n)))) {
    return(NULL)
  }

  as.numeric(sizes)
}

# A view's arrangement for display: its stored grid when that grid places
# exactly the view's current members, else a flat split over the members (so
# a grid that has drifted from membership never shows a ghost or hides a
# panel). Membership is authoritative; the grid only arranges it.
view_display_grid <- function(members, grid) {

  if (is.null(grid) || !setequal(layout_panel_ids(grid), members)) {
    return(flat_grid(members))
  }

  grid
}

flat_grid <- function(members) {
  as_dock_grid(
    list(
      orientation = "horizontal",
      children = lapply(members, panel_leaf)
    )
  )
}

panel_leaf <- function(id) {
  list(panels = id, active = id)
}

# A block or extension id (bare, as the model names it) becomes the typed panel
# ref the `views$mod` panel-op grammar takes, carrying any placement hint.
# Block-first, mirroring how dock resolves bare-id sugar: an id known only as an
# extension becomes `ext()`, everything else `blk()`.
panel_ref_from_id <- function(id, block_ids, ext_ids, near = NULL,
                              side = NULL) {

  if (id %in% ext_ids && !id %in% block_ids) {
    ext(id, near = near, side = side)
  } else {
    blk(id, near = near, side = side)
  }
}

valid_panel_sides <- function() {
  c("within", "left", "right", "above", "below")
}
