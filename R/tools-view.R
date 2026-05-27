register_view_tools <- function(client, board, pending, view_data,
                                session) {

  client$register_tool(tool_list_views(board, view_data, session))
  client$register_tool(tool_validate_layout(board, pending, session))
  client$register_tool(tool_add_view(board, pending, session))
  client$register_tool(tool_remove_view(board, pending, view_data, session))
  client$register_tool(tool_modify_view(board, pending, session))
  client$register_tool(tool_set_active_view(board, pending, view_data, session))
  client$register_tool(tool_rename_view(board, pending, view_data, session))

  invisible(client)
}

valid_panel_ids <- function(board, pending) {

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

  c(block_ids, ext_ids)
}

current_layouts <- function(board, view_data) {

  vd <- if (is.null(view_data)) NULL else isolate(view_data())

  if (!is.null(vd)) {
    return(vd)
  }

  board_layouts(isolate(board$board))
}

current_view_names <- function(board, view_data) {
  names(current_layouts(board, view_data))
}

post_pending_view_names <- function(board, pending, view_data) {

  live <- current_view_names(board, view_data)
  pen  <- isolate(pending())

  setdiff(c(live, names(pen$views$add)), pen$views$rm)
}

tool_list_views <- function(board, view_data, session) {

  ellmer::tool(
    function() {
      with_tool_errors("list_views", {

        layouts <- current_layouts(board, view_data)

        if (!length(layouts)) {
          return(list())
        }

        active <- tryCatch(
          active_view(layouts),
          error = function(e) NA_character_
        )

        lapply(names(layouts), function(nm) {
          list(
            name   = nm,
            active = identical(nm, active),
            layout = layout_to_spec(layouts[[nm]])
          )
        })
      })
    },
    name = "list_views",
    description = paste(
      "List all views (named tabs) on the board. One entry per",
      "view: name, whether it's the currently-active view, and",
      "the view's layout in the JSON spec form documented in the",
      "Layout section. Reads the live layout state, so it reflects",
      "any UI-driven rearrangements since the last commit."
    ),
    arguments = list()
  )
}

tool_validate_layout <- function(board, pending, session) {

  ellmer::tool(
    function(layout) {
      with_tool_errors("validate_layout", {

        parsed <- parse_layout_json(layout)

        spec <- layout_to_spec(parsed)

        used  <- unique(collect_panel_ids(spec$children))
        valid <- valid_panel_ids(board, pending)
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
          jsonlite::toJSON(spec, auto_unbox = TRUE)
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

        layout_obj <- parse_layout_json(layout)

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
      "Add a new view (named tab) with the given layout. `layout`",
      "is a JSON object string in the same shape `list_views`",
      "returns. Pass `active = true` to switch to the new view at",
      "flush time."
    ),
    arguments = list(
      name   = ellmer::type_string("Name for the new view."),
      layout = ellmer::type_string(
        paste(
          "JSON object describing the view's layout. Shape:",
          "{\"children\": [...], \"orientation\": \"horizontal\" |",
          "\"vertical\", \"sizes\": [...], \"active_group\": \"...\"}.",
          "Children may be bare ID strings, arrays of IDs (tabbed",
          "leaves), {\"panels\": [...], \"active\": \"...\"} objects,",
          "or {\"group\": [...], \"sizes\": [...]} objects."
        )
      ),
      active = ellmer::type_boolean(
        "Mark the new view as active on flush.",
        required = FALSE
      )
    )
  )
}

tool_remove_view <- function(board, pending, view_data, session) {

  ellmer::tool(
    function(name) {
      with_tool_errors("remove_view", {

        remaining <- setdiff(
          post_pending_view_names(board, pending, view_data),
          name
        )

        if (!length(remaining)) {
          stop(
            "cannot remove the last remaining view",
            call. = FALSE
          )
        }

        stage_view_rm(pending, board, name)

        sprintf(
          "Staged remove_view(%s) -- will apply at turn end.", name
        )
      })
    },
    name = "remove_view",
    description = paste(
      "Remove a view by name. Blocks placed only in that view stay",
      "on the board but become unplaced; remove them separately if",
      "needed. Rejected if it would leave the board with no views."
    ),
    arguments = list(
      name = ellmer::type_string("View name to remove.")
    )
  )
}

tool_modify_view <- function(board, pending, session) {

  ellmer::tool(
    function(name, layout) {
      with_tool_errors("modify_view", {

        layout_obj <- parse_layout_json(layout)

        stage_view_mod(pending, board, name, layout_obj)

        sprintf(
          "Staged modify_view(%s) -- will apply at turn end.", name
        )
      })
    },
    name = "modify_view",
    description = paste(
      "Replace a view's layout. `layout` is a JSON object in the",
      "same shape `list_views` returns -- read the current layout,",
      "edit it, and write it back. Blocks referenced in the new",
      "layout must exist on the board or be staged for creation in",
      "this turn."
    ),
    arguments = list(
      name = ellmer::type_string("Name of the view to modify."),
      layout = ellmer::type_string(
        "JSON layout object; same shape as add_view's `layout`."
      )
    )
  )
}

tool_set_active_view <- function(board, pending, view_data, session) {

  ellmer::tool(
    function(name) {
      with_tool_errors("set_active_view", {

        candidates <- post_pending_view_names(board, pending, view_data)

        if (!name %in% candidates) {
          stop(
            sprintf(
              "view %s does not exist (and is not staged for creation)",
              name
            ),
            call. = FALSE
          )
        }

        stage_view_active(pending, board, name)

        sprintf(
          "Staged set_active_view(%s) -- will apply at turn end.", name
        )
      })
    },
    name = "set_active_view",
    description = paste(
      "Switch the active view (the tab shown by default on next",
      "render). The named view must exist on the board or be",
      "staged for creation in this turn."
    ),
    arguments = list(
      name = ellmer::type_string("View name to activate.")
    )
  )
}

tool_rename_view <- function(board, pending, view_data, session) {

  ellmer::tool(
    function(from, to) {
      with_tool_errors("rename_view", {

        layouts <- current_layouts(board, view_data)

        if (!from %in% names(layouts)) {
          stop(
            sprintf("view %s does not exist", from),
            call. = FALSE
          )
        }

        if (to %in% post_pending_view_names(board, pending, view_data)) {
          stop(
            sprintf("a view named %s already exists", to),
            call. = FALSE
          )
        }

        was_active <- identical(
          tryCatch(active_view(layouts), error = function(e) NA_character_),
          from
        )

        stage_view_add(
          pending, board, to, layouts[[from]],
          active = isTRUE(was_active)
        )

        stage_view_rm(pending, board, from)

        sprintf(
          "Staged rename_view(%s -> %s) -- will apply at turn end.",
          from, to
        )
      })
    },
    name = "rename_view",
    description = paste(
      "Rename a view. Carries over the current layout and the",
      "active marker (if `from` was the active view, `to` becomes",
      "active). Implemented as add(to, <layout>) + rm(from) under",
      "the hood -- the two changes apply atomically at flush."
    ),
    arguments = list(
      from = ellmer::type_string("Current view name."),
      to   = ellmer::type_string("New view name.")
    )
  )
}
