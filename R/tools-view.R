register_view_tools <- function(client, board, pending, view_data, session) {

  client$register_tool(tool_list_views(board, view_data, session))
  client$register_tool(tool_validate_layout(board, pending, session))
  client$register_tool(tool_add_view(board, pending, session))
  client$register_tool(tool_remove_view(board, pending, session))
  client$register_tool(tool_add_panel_to_view(board, pending, session))
  client$register_tool(tool_remove_panel_from_view(board, pending, session))
  client$register_tool(tool_move_panel(board, pending, session))
  client$register_tool(tool_resize_panel(board, pending, session))
  client$register_tool(tool_focus_panel(board, pending, session))
  client$register_tool(tool_set_active_view(board, pending, session))
  client$register_tool(tool_rename_view(board, pending, session))

  invisible(client)
}

# Resolve a model-supplied bare panel id (and optional placement hint) to the
# typed ref the panel-op tools stage, validating that the panel -- and any
# `near` anchor -- names a current or staged-this-turn block or extension. dock
# re-checks membership and anchor validity for the whole batch at commit.
resolve_panel_op_ref <- function(panel, near, side, board, pending,
                                 size = NULL) {

  sets  <- panel_id_sets(board, pending)
  valid <- c(sets$blocks, sets$exts)

  if (!panel %in% valid) {
    stop(
      sprintf(
        paste(
          "panel %s does not resolve to a current block or extension",
          "(call list_blocks for current ids)"
        ),
        panel
      ),
      call. = FALSE
    )
  }

  if (not_null(near) && !near %in% valid) {
    stop(
      sprintf(
        "near panel %s does not resolve to a current block or extension",
        near
      ),
      call. = FALSE
    )
  }

  if (not_null(side) && !side %in% valid_panel_sides()) {
    stop(
      sprintf(
        "side must be one of: %s", paste(valid_panel_sides(), collapse = ", ")
      ),
      call. = FALSE
    )
  }

  if (not_null(size) && !(is_number(size) && size > 0 && size < 1)) {
    stop(
      "size must be a ratio in (0, 1)",
      call. = FALSE
    )
  }

  as_panel_ref(
    panel, sets$blocks, sets$exts, near = near, side = side, size = size
  )
}

placement_suffix <- function(near, side) {

  if (is.null(near) && is.null(side)) {
    return("")
  }

  parts <- c(
    if (not_null(side)) side,
    if (not_null(near)) paste("of", near)
  )

  sprintf(" (%s)", paste(parts, collapse = " "))
}

panel_id_sets <- function(board, pending) {

  brd <- isolate(board$board)
  pen <- isolate(pending())

  block_ids <- setdiff(
    c(names(board_blocks(brd)), names(pen$blocks$add)),
    pen$blocks$rm
  )

  ext_ids <- if (inherits(brd, "dock_board")) {
    dock_ext_ids(brd)
  } else {
    character()
  }

  list(blocks = block_ids, exts = ext_ids)
}

valid_panel_ids <- function(board, pending) {

  sets <- panel_id_sets(board, pending)

  c(sets$blocks, sets$exts)
}

current_views <- function(board) {

  brd <- isolate(board$board)

  if (inherits(brd, "dock_board")) {
    board_views(brd)
  } else {
    list()
  }
}

current_view_ids <- function(board) {
  names(current_views(board))
}

# The view handles addressable this turn: the ids of views already on the
# board, plus the display-name keys of views staged for creation (a new
# view has no id until the dock mints it at flush, so its add key is the
# handle until then), minus anything staged for removal.
addressable_views <- function(board, pending) {

  pen <- isolate(pending())

  setdiff(
    c(current_view_ids(board), names(pen$views$add)),
    pen$views$rm
  )
}

effective_active_view <- function(board, pending) {

  staged <- isolate(pending())$views$active

  if (not_null(staged)) {
    return(staged)
  }

  tryCatch(active_view(isolate(board$board)), error = function(e) NULL)
}

# The all-views layout to show the model: dock's live `view_data` (a
# `dock_views` + `dock_grids` pair) once every view has reported, else the
# committed board's own views + grids. dock echoes only *settled* arrangements
# back to the board, so `view_data` is the fresher source for what the user
# currently sees; the committed board is the fallback while `view_data` is still
# NULL (before every view reports) or absent (no dock at all).
resolve_view_layout <- function(board, view_data = NULL) {

  live <- if (is.function(view_data)) isolate(view_data()) else NULL

  if (!is.null(live)) {
    return(list(views = live[["views"]], grids = live[["grids"]]))
  }

  brd <- isolate(board$board)

  if (!inherits(brd, "dock_board")) {
    return(list(views = list(), grids = NULL))
  }

  list(views = board_views(brd), grids = board_grids(brd))
}

tool_list_views <- function(board, view_data, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_views", {

        layout <- resolve_view_layout(board, view_data)
        views  <- layout$views

        if (!length(views)) {
          return(list())
        }

        grids  <- layout$grids
        labels <- view_names(views)
        active <- tryCatch(
          active_view(views), error = function(e) NA_character_
        )

        lapply(names(views), function(id) {
          list(
            id     = id,
            name   = labels[[id]],
            active = identical(id, active),
            layout = layout_to_llm_spec(
              view_display_grid(view_members(views[[id]]), grids[[id]])
            )
          )
        })
      })
    },
    name = "list_views",
    description = paste(
      "List all views (tabs) on the board. One entry per view: its",
      "stable `id` (the handle the panel-op, remove_view,",
      "set_active_view and rename_view tools address the view by), its",
      "display `name`, whether it's the currently-active view, and",
      "its `layout` in the JSON spec form the `layout` skill",
      "documents. Reads the live layout, so UI-driven rearrangements",
      "show up here immediately."
    ),
    arguments = list()
  )
}

tool_validate_layout <- function(board, pending, session) {

  ellmer::tool(
    function(layout) {
      with_tool_errors("validate_layout", {

        sets   <- panel_id_sets(board, pending)
        parsed <- layout_from_json(layout, sets$blocks, sets$exts)

        used  <- panel_obj_ids(layout_panel_ids(parsed))
        valid <- c(sets$blocks, sets$exts)
        bad   <- setdiff(used, valid)

        if (length(bad)) {
          stop(
            sprintf(
              paste(
                "panel ID(s) do not resolve to current blocks or",
                "extensions (call list_blocks for current ids): %s"
              ),
              paste(bad, collapse = ", ")
            ),
            call. = FALSE
          )
        }

        sprintf(
          "OK -- layout parses and all panel IDs resolve. Normalized: %s",
          jsonlite::toJSON(layout_to_llm_spec(parsed), auto_unbox = TRUE)
        )
      })
    },
    name = "validate_layout",
    description = paste(
      "Parse and panel-id-check a layout JSON without staging.",
      "Returns OK plus the normalized layout on success, or a",
      "classed error describing what's wrong. Cheap probe before",
      "add_view; never mutates board state."
    ),
    arguments = list(
      layout = ellmer::type_string(
        "JSON layout object; same shape as add_view's `layout`."
      )
    )
  )
}

tool_add_view <- function(board, pending, session) {

  ellmer::tool(
    function(name, layout, active = FALSE) {
      with_tool_errors("add_view", {

        sets       <- panel_id_sets(board, pending)
        layout_obj <- layout_from_json(layout, sets$blocks, sets$exts)

        stage_view_add(
          pending, board, name, layout_obj, active = isTRUE(active)
        )

        sprintf(
          "Staged add_view(%s)%s -- call commit to apply.",
          name,
          if (isTRUE(active)) " as active" else ""
        )
      })
    },
    name = "add_view",
    description = paste(
      "Add a new view (tab) with the given layout. `name` is its",
      "display label; the board assigns the view a stable id (see",
      "list_views). `layout` is a JSON object string in the same",
      "shape `list_views` returns -- call read_skill(\"layout\") for",
      "that grammar before composing one. Pass `active = true` to",
      "switch to the new view at flush time."
    ),
    arguments = list(
      name   = ellmer::type_string("Display label for the new view."),
      layout = ellmer::type_string(
        paste(
          "JSON object describing the view's layout, in the shape",
          "`list_views` returns. The `layout` skill carries the full",
          "spec and worked examples."
        )
      ),
      active = ellmer::type_boolean(
        "Mark the new view as active on flush.",
        required = FALSE
      )
    )
  )
}

tool_remove_view <- function(board, pending, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("remove_view", {

        remaining <- setdiff(addressable_views(board, pending), id)

        if (!length(remaining)) {
          stop(
            "cannot remove the last remaining view",
            call. = FALSE
          )
        }

        stage_view_rm(pending, board, id)

        sprintf(
          "Staged remove_view(%s) -- call commit to apply.", id
        )
      })
    },
    name = "remove_view",
    description = paste(
      "Remove a view by id (see list_views). Blocks placed only in",
      "that view stay on the board but become unplaced; remove them",
      "separately if needed. Rejected if it would leave the board",
      "with no views."
    ),
    arguments = list(
      id = ellmer::type_string("View id to remove.")
    )
  )
}

tool_add_panel_to_view <- function(board, pending, session) {

  ellmer::tool(
    function(view, panel, near = NULL, side = NULL, size = NULL) {
      with_tool_errors("add_panel_to_view", {

        ref <- resolve_panel_op_ref(
          panel, near, side, board, pending, size = size
        )

        stage_view_panel_op(
          pending, board, "add_panel_to_view", view, "add", ref
        )

        sprintf(
          "Staged add_panel_to_view(%s, %s)%s -- call commit to apply.",
          view, panel, placement_suffix(near, side)
        )
      })
    },
    name = "add_panel_to_view",
    description = paste(
      "Add a block or extension to a view as a panel, addressed by",
      "view id (see list_views). `panel` is the block or extension id;",
      "it must be on the board or staged for creation this turn.",
      "Optionally place it with `near` (a panel already in the view)",
      "and `side` (which side of `near` -- within tabs it into that",
      "group); omit both to let dock pick a default spot. Optionally",
      "give `size` (a ratio in (0, 1)) to record the panel's target",
      "size along its split axis for when it lands. Adding a panel",
      "already in the view is an error -- reposition it with",
      "move_panel, or resize it with resize_panel, instead."
    ),
    arguments = list(
      view = ellmer::type_string(
        "Id of the view to add the panel to (see list_views)."
      ),
      panel = ellmer::type_string(
        "Block or extension id to add to the view."
      ),
      near = ellmer::type_string(
        "Optional panel already in the view to place the new one next to.",
        required = FALSE
      ),
      side = ellmer::type_enum(
        valid_panel_sides(),
        "Optional side of `near` to place the panel on.",
        required = FALSE
      ),
      size = ellmer::type_number(
        "Optional target size ratio in (0, 1) for the panel's group.",
        required = FALSE
      )
    )
  )
}

tool_remove_panel_from_view <- function(board, pending, session) {

  ellmer::tool(
    function(view, panel) {
      with_tool_errors("remove_panel_from_view", {

        ref <- resolve_panel_op_ref(panel, NULL, NULL, board, pending)

        stage_view_panel_op(
          pending, board, "remove_panel_from_view", view, "rm", ref
        )

        sprintf(
          "Staged remove_panel_from_view(%s, %s) -- call commit to apply.",
          view, panel
        )
      })
    },
    name = "remove_panel_from_view",
    description = paste(
      "Remove a panel from a view, addressed by view id (see",
      "list_views). `panel` is the block or extension id; it must",
      "currently be a member of the view. The block or extension stays",
      "on the board -- only its panel in this view is dropped. Removing",
      "a block from the board drops its panels everywhere on its own; no",
      "explicit cleanup needed."
    ),
    arguments = list(
      view = ellmer::type_string(
        "Id of the view to remove the panel from."
      ),
      panel = ellmer::type_string(
        "Block or extension id to drop from the view."
      )
    )
  )
}

tool_move_panel <- function(board, pending, session) {

  ellmer::tool(
    function(view, panel, near, side = NULL) {
      with_tool_errors("move_panel", {

        ref <- resolve_panel_op_ref(panel, near, side, board, pending)

        stage_view_panel_op(pending, board, "move_panel", view, "move", ref)

        sprintf(
          "Staged move_panel(%s, %s)%s -- call commit to apply.",
          view, panel, placement_suffix(near, side)
        )
      })
    },
    name = "move_panel",
    description = paste(
      "Reposition a panel already in a view, addressed by view id (see",
      "list_views). Moves `panel` next to `near` (another panel in the",
      "same view), on the given `side` (within tabs it into `near`'s",
      "group). Both must be current members of the view; membership is",
      "unchanged -- only the arrangement moves."
    ),
    arguments = list(
      view = ellmer::type_string("Id of the view whose panel moves."),
      panel = ellmer::type_string(
        "Block or extension id of the panel to move."
      ),
      near = ellmer::type_string(
        "Panel already in the view to move `panel` next to."
      ),
      side = ellmer::type_enum(
        valid_panel_sides(),
        "Which side of `near` the panel moves to.",
        required = FALSE
      )
    )
  )
}

tool_resize_panel <- function(board, pending, session) {

  ellmer::tool(
    function(view, panel, size) {
      with_tool_errors("resize_panel", {

        ref <- resolve_panel_op_ref(
          panel, NULL, NULL, board, pending, size = size
        )

        stage_view_panel_op(
          pending, board, "resize_panel", view, "resize", ref
        )

        sprintf(
          "Staged resize_panel(%s, %s) to %s -- call commit to apply.",
          view, panel, size
        )
      })
    },
    name = "resize_panel",
    description = paste(
      "Resize a panel already in a view, addressed by view id (see",
      "list_views). Sets `size` (a ratio in (0, 1)) -- the fraction of",
      "its splitview the panel's group occupies along the split axis,",
      "relative to its siblings. `panel` must currently be a member of",
      "the view; membership and arrangement are otherwise unchanged. To",
      "size a panel as you add it, pass add_panel_to_view's `size`",
      "instead."
    ),
    arguments = list(
      view = ellmer::type_string(
        "Id of the view whose panel resizes (see list_views)."
      ),
      panel = ellmer::type_string(
        "Block or extension id of the panel to resize."
      ),
      size = ellmer::type_number(
        "Target size ratio in (0, 1) for the panel's group."
      )
    )
  )
}

tool_focus_panel <- function(board, pending, session) {

  ellmer::tool(
    function(view, panel) {
      with_tool_errors("focus_panel", {

        ref <- resolve_panel_op_ref(panel, NULL, NULL, board, pending)

        stage_view_panel_op(
          pending, board, "focus_panel", view, "select", ref
        )

        switched <- !identical(view, effective_active_view(board, pending))

        if (switched) {
          stage_view_active(pending, board, view)
        }

        sprintf(
          "Staged focus_panel(%s, %s)%s -- call commit to apply.",
          view, panel,
          if (switched) " and switched to that view" else ""
        )
      })
    },
    name = "focus_panel",
    description = paste(
      "Bring a panel already in a view to the front of its tab group",
      "and focus it, addressed by view id (see list_views). `panel`",
      "must currently be a member of the view. If `view` isn't the",
      "active one, the board switches to it so the panel is actually",
      "surfaced. Use it to draw attention to a specific block or",
      "extension -- e.g. one you just added or whose result you just",
      "evaluated. Membership and arrangement are unchanged; only the",
      "front tab and active view move."
    ),
    arguments = list(
      view = ellmer::type_string(
        "Id of the view holding the panel (see list_views)."
      ),
      panel = ellmer::type_string(
        "Block or extension id to bring to the front."
      )
    )
  )
}

tool_set_active_view <- function(board, pending, session) {

  ellmer::tool(
    function(id) {
      with_tool_errors("set_active_view", {

        candidates <- addressable_views(board, pending)

        if (!id %in% candidates) {
          stop(
            sprintf(
              "view %s does not exist (and is not staged for creation)",
              id
            ),
            call. = FALSE
          )
        }

        stage_view_active(pending, board, id)

        sprintf(
          "Staged set_active_view(%s) -- call commit to apply.", id
        )
      })
    },
    name = "set_active_view",
    description = paste(
      "Switch the active view (the tab shown by default on next",
      "render), addressed by id (see list_views). The view must",
      "exist on the board, or be a view staged for creation this",
      "turn (pass the name given to add_view)."
    ),
    arguments = list(
      id = ellmer::type_string(
        paste(
          "View id to activate, or the name of a view added this",
          "turn."
        )
      )
    )
  )
}

tool_rename_view <- function(board, pending, session) {

  ellmer::tool(
    function(id, name) {
      with_tool_errors("rename_view", {

        if (!id %in% current_view_ids(board)) {
          stop(
            sprintf("view %s does not exist", id),
            call. = FALSE
          )
        }

        stage_view_rename(pending, board, id, name)

        sprintf(
          "Staged rename_view(%s -> %s) -- call commit to apply.",
          id, name
        )
      })
    },
    name = "rename_view",
    description = paste(
      "Change a view's display label, addressed by id (see",
      "list_views). The view keeps its id, layout and active state",
      "-- only the label changes."
    ),
    arguments = list(
      id   = ellmer::type_string("Id of the view to rename."),
      name = ellmer::type_string("New display label.")
    )
  )
}

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
  if (is.null(id)) NULL else as.character(as_panel_ref(id, block_ids, ext_ids))
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

valid_panel_sides <- function() {
  c("within", "left", "right", "above", "below")
}
