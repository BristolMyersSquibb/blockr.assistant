register_view_tools <- function(client, board, pending, session) {

  client$register_tool(tool_list_views(board, session))
  client$register_tool(tool_validate_layout(board, pending, session))
  client$register_tool(tool_add_view(board, pending, session))
  client$register_tool(tool_remove_view(board, pending, session))
  client$register_tool(tool_modify_view(board, pending, session))
  client$register_tool(tool_set_active_view(board, pending, session))
  client$register_tool(tool_rename_view(board, pending, session))

  invisible(client)
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

tool_list_views <- function(board, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_views", {

        views <- current_views(board)

        if (!length(views)) {
          return(list())
        }

        brd    <- isolate(board$board)
        grids  <- board_grids(brd)
        labels <- view_names(views)
        active <- tryCatch(active_view(brd), error = function(e) NA_character_)

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
      "stable `id` (the handle modify_view / remove_view /",
      "set_active_view / rename_view address the view by), its",
      "display `name`, whether it's the currently-active view, and",
      "its `layout` in the JSON spec form documented in the Layout",
      "section. Reflects UI-driven rearrangements once they have",
      "synced back to the board."
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
      "add_view / modify_view; never mutates board state."
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
          "Staged add_view(%s)%s -- will apply at turn end.",
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
      "shape `list_views` returns. Pass `active = true` to switch",
      "to the new view at flush time."
    ),
    arguments = list(
      name   = ellmer::type_string("Display label for the new view."),
      layout = ellmer::type_string(
        paste(
          "JSON object describing the view's layout, in the shape",
          "`list_views` returns. See the Layout section for the full",
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
          "Staged remove_view(%s) -- will apply at turn end.", id
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

tool_modify_view <- function(board, pending, session) {

  ellmer::tool(
    function(id, layout) {
      with_tool_errors("modify_view", {

        sets       <- panel_id_sets(board, pending)
        layout_obj <- layout_from_json(layout, sets$blocks, sets$exts)

        stage_view_mod(pending, board, id, layout_obj)

        sprintf(
          "Staged modify_view(%s) -- will apply at turn end.", id
        )
      })
    },
    name = "modify_view",
    description = paste(
      "Set which panels a view holds, addressed by id (see",
      "list_views). `layout` is a JSON object in the same shape",
      "`list_views` returns; its panels become the view's members --",
      "those the layout adds are added, those it omits are removed.",
      "Existing panels keep their current arrangement and newly added",
      "ones take a default spot (dock owns arrangement); to author a",
      "specific arrangement, create the view with add_view. Blocks",
      "referenced must exist on the board or be staged for creation",
      "this turn."
    ),
    arguments = list(
      id = ellmer::type_string("Id of the view to modify."),
      layout = ellmer::type_string(
        "JSON layout object; same shape as add_view's `layout`."
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
          "Staged set_active_view(%s) -- will apply at turn end.", id
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
          "Staged rename_view(%s -> %s) -- will apply at turn end.",
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
