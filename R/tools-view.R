# Mutation tools — dock views and layouts.
#
# These wrap blockr.dock's external mutation helpers (dock_add_view,
# dock_remove_view, dock_rename_view, dock_set_layout, dock_get_layout,
# dock_set_active_view). Unlike the block/link/stack mutation tools
# which stage into `pending` and flush at turn end, view/layout
# mutations apply immediately via the live Shiny session captured
# from the extension's moduleServer scope.

register_view_tools <- function(client, board, session) {

  client$register_tool(tool_get_views(board, session))
  client$register_tool(tool_get_layout(board, session))
  client$register_tool(tool_add_view(board, session))
  client$register_tool(tool_remove_view(board, session))
  client$register_tool(tool_rename_view(board, session))
  client$register_tool(tool_set_active_view(board, session))
  client$register_tool(tool_set_layout(board, session))
}

tool_get_views <- function(board, session) {

  ellmer::tool(
    function() {
      with_tool_errors("get_views", {
        st <- isolate(blockr.dock::dock_state(session = session))
        if (is.null(st)) {
          return(list(views = character(0L),
                      active_view = NA_character_))
        }
        list(views = st$views, active_view = st$active_view)
      })
    },
    name = "get_views",
    description = paste(
      "List dock views with which one is active. Reads live dock",
      "state, so reflects any view-switching the user has done."
    ),
    arguments = list()
  )
}

tool_get_layout <- function(board, session) {

  ellmer::tool(
    function() {
      with_tool_errors("get_layout", {
        res <- isolate(blockr.dock::dock_get_layout(session = session))
        if (is.null(res)) {
          return(list(active_view = NA_character_,
                      views = character(0L),
                      panels = character(0L)))
        }
        list(
          active_view = res$active_view,
          views       = res$views,
          panels      = as.character(res$panels)
        )
      })
    },
    name = "get_layout",
    description = paste(
      "Read the active dock view's layout: active view name, all",
      "view names, and the block/extension ids currently placed in",
      "the active view. Call before set_layout to see what is",
      "arrangeable."
    ),
    arguments = list()
  )
}

tool_set_layout <- function(board, session) {

  ellmer::tool(
    function(grid_json) {
      with_tool_errors("set_layout", {
        grid <- tryCatch(
          jsonlite::fromJSON(grid_json, simplifyVector = FALSE),
          error = function(e) {
            stop(sprintf("grid_json is not valid JSON: %s",
                         conditionMessage(e)), call. = FALSE)
          }
        )
        if (!is.list(grid) || !is.null(names(grid))) {
          stop("grid_json must encode a JSON array (top-level []).",
               call. = FALSE)
        }
        av <- isolate(blockr.dock::dock_set_layout(grid, session = session))
        sprintf("Layout applied to active view '%s'.", av)
      })
    },
    name = "set_layout",
    description = paste(
      "Arrange the ACTIVE dock view from a grid. Rebuilds that view's",
      "dock in place. grid_json is a JSON nested array of",
      "block/extension ids: a string is one panel; an array of",
      "strings tabs them in one panel; nesting creates splits (top",
      "level horizontal, next vertical, alternating; equal sizing",
      "per level). Ids must already exist on the board (use",
      "list_blocks or list_extensions). Include the dag extension",
      "id (typically \"dag_extension\") if you want the workflow",
      "graph panel placed. Pass as a JSON STRING (not a structured",
      "array).",
      "",
      "Example (data left, filter+chart tabbed right):",
      "'[[\"data_1\"],[\"filter_1\",\"chart_1\"]]'."
    ),
    arguments = list(
      grid_json = ellmer::type_string(
        "JSON nested array of block/extension ids. See description."
      )
    )
  )
}

tool_add_view <- function(board, session) {

  ellmer::tool(
    function(name, blocks_json = NULL, exts_json = NULL) {
      with_tool_errors("add_view", {
        parse_ids <- function(j) {
          if (is.null(j) || !nzchar(j)) return(NULL)
          v <- tryCatch(
            jsonlite::fromJSON(j, simplifyVector = TRUE),
            error = function(e) {
              stop(sprintf("invalid JSON id array: %s",
                           conditionMessage(e)), call. = FALSE)
            }
          )
          as.character(v)
        }
        nm <- isolate(blockr.dock::dock_add_view(
          name,
          blocks = parse_ids(blocks_json),
          exts   = parse_ids(exts_json),
          session = session
        ))
        sprintf("Added view '%s' and switched to it.", nm)
      })
    },
    name = "add_view",
    description = paste(
      "Add a new dock view (tab) and switch to it. By default the",
      "view contains all board blocks and extensions; pass",
      "blocks_json and/or exts_json (JSON arrays of ids) to scope",
      "the view to a subset. Use for multi-tab dashboards (e.g. one",
      "view per branch of the pipeline), then call set_layout to",
      "arrange the new view."
    ),
    arguments = list(
      name = ellmer::type_string("Name for the new view."),
      blocks_json = ellmer::type_string(
        "Optional JSON array of block ids. Omit for all board blocks.",
        required = FALSE
      ),
      exts_json = ellmer::type_string(
        "Optional JSON array of extension ids. Omit for all.",
        required = FALSE
      )
    )
  )
}

tool_remove_view <- function(board, session) {

  ellmer::tool(
    function(view_name) {
      with_tool_errors("remove_view", {
        av <- isolate(blockr.dock::dock_remove_view(view_name,
                                                    session = session))
        sprintf("Removed view '%s'. Active view is now '%s'.",
                view_name, av)
      })
    },
    name = "remove_view",
    description = paste(
      "Remove a dock view (tab) by name. Refuses to remove the last",
      "view. Blocks themselves stay on the board; only the view is",
      "removed."
    ),
    arguments = list(
      view_name = ellmer::type_string("Name of the view to remove.")
    )
  )
}

tool_rename_view <- function(board, session) {

  ellmer::tool(
    function(old, new) {
      with_tool_errors("rename_view", {
        nm <- isolate(blockr.dock::dock_rename_view(old, new,
                                                    session = session))
        sprintf("Renamed view '%s' to '%s'.", old, nm)
      })
    },
    name = "rename_view",
    description = paste(
      "Rename a dock view. Use to give views meaningful names -- in",
      "particular rename the default 'Page' view to something",
      "descriptive (e.g. 'Demographics'). Blocks and layout are",
      "unaffected."
    ),
    arguments = list(
      old = ellmer::type_string("Current view name."),
      new = ellmer::type_string("New view name.")
    )
  )
}

tool_set_active_view <- function(board, session) {

  ellmer::tool(
    function(view_name) {
      with_tool_errors("set_active_view", {
        isolate(blockr.dock::dock_set_active_view(view_name,
                                                   session = session))
        sprintf("Active view set to '%s'.", view_name)
      })
    },
    name = "set_active_view",
    description = paste(
      "Switch the active dock view. Equivalent to the user clicking",
      "a view tab. The view name must already exist; use get_views",
      "to list available views."
    ),
    arguments = list(
      view_name = ellmer::type_string("Name of the view to activate.")
    )
  )
}
