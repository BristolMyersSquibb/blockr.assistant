# Where the user's attention is on the board, for the prompt. Two things are
# read off the screen and told to the model, which decides for itself whether
# a request is about them: the blocks in the current view, and the block the
# user last made active there. The picker under the composer stays the way to
# single blocks out on purpose; see `focus_r` in the extension server.
#
# `panel` is the panel the user last made active, as dockViewR announces it
# in the browser (see focus.js). dock's own `focus` on `view_data()` cannot
# serve: it drops the first panel group, which dockview also activates by
# default on load. The chat panel is a dock panel too, so clicking into the
# message box makes the assistant active: only block panels are read, so the
# block clicked on the way to the composer survives the trip.
#
# A block the model adds is made active by dock, so it becomes the last
# active block. That is intended: the model knows it just added it, and the
# user sees it fronted.
new_focus_state <- function(board, view_data, panel) {

  seen <- reactiveVal(NULL)

  observeEvent(panel(), {

    pid <- panel()

    if (is_block_panel(pid)) {
      seen(panel_obj_ids(pid))
    }
  })

  # Every panel activation changes `view_data()`, while the blocks in view
  # change only with a view switch or a block added or removed. A
  # reactiveVal ignores an identical value, so the picker and the prompt are
  # not redone for each click on the board.
  in_view <- reactiveVal(character())

  observe(in_view(view_focus_blocks(board, view_data)))

  # A block that left the board or the view is no longer what the user is
  # looking at: a view switch moves their attention with it.
  last_active <- reactiveVal(NULL)

  observe({
    id <- seen()
    last_active(if (length(id) && id %in% in_view()) id)
  })

  list(
    in_view = in_view,
    last_active = last_active
  )
}

is_block_panel <- function(x) {
  is.character(x) && length(x) == 1L && startsWith(x, "block_panel-")
}

# The blocks in the active view, in screen order: panel group by panel group,
# each group's tabs as they sit in its tab strip. Not the front tab first,
# which would change the order, and redraw the picker, with every tab switch.
# Without a dock (or before it reports) every block on the board.
view_focus_blocks <- function(board, view_data) {

  ids <- board_block_ids(board$board)
  live <- if (is.function(view_data)) view_data() else NULL

  if (is.null(live)) {
    return(ids)
  }

  views <- live[["views"]]
  active <- tryCatch(active_view(views), error = function(e) NULL)

  if (is.null(active) || is.null(views[[active]])) {
    return(ids)
  }

  members <- view_members(views[[active]])
  pids <- unique(c(grid_screen_order(live[["grids"]][[active]]), members))
  pids <- intersect(pids, members)
  pids <- Filter(is_block_panel, pids)

  intersect(panel_obj_ids(unlist(pids)), ids)
}

grid_screen_order <- function(grid) {

  walk <- function(nodes) {
    unlist(
      lapply(
        nodes,
        function(node) {
          if (!is.null(node[["panels"]])) {
            unlist(node[["panels"]])
          } else {
            walk(node[["children"]])
          }
        }
      )
    )
  }

  if (is.null(grid)) {
    return(character())
  }

  as.character(walk(grid[["children"]]))
}

focus_dep <- function() {
  htmltools::htmlDependency(
    "blockr-assistant-focus",
    as.character(utils::packageVersion("blockr.assistant")),
    src = system.file("assets", package = "blockr.assistant"),
    script = "focus.js"
  )
}
