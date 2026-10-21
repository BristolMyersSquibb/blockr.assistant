# Which blocks the assistant is pointed at, shown as tags under the
# composer. What the tags show is what the model is told.
#
# The block the user last clicked in the current view shows as a tag and is
# sent with every message, with nothing to accept first. Its x leaves it out
# until the next click on a block. The @ adds other blocks from the view;
# those stay until they are taken off. The model is also told which blocks
# the current view holds.
#
# `panel` is the panel the user last made active, as dockViewR announces it
# in the browser (see focus.js). dock's own `focus` on `view_data()` cannot
# serve: it drops the first panel group, which dockview also activates by
# default on load. The chat panel is a dock panel too, so clicking into the
# message box makes the assistant active: only block panels are read, so the
# block clicked on the way to the composer survives the trip.
#
# A block that dock fronts, such as one the assistant adds, counts as
# clicked: the user sees it come to the front.
new_focus_state <- function(board, view_data, panel) {

  seen      <- reactiveVal(NULL)
  dismissed <- reactiveVal(FALSE)
  added     <- reactiveVal(character())

  # dockview announces a change of the active panel only, so every block
  # announced is a fresh click on it, including a click back from the
  # assistant's own panel. That is what brings back a block left out.
  observeEvent(panel(), {

    pid <- panel()

    if (!is_block_panel(pid)) {
      return()
    }

    seen(panel_obj_ids(pid))
    dismissed(FALSE)
  })

  # Every panel activation changes `view_data()`, while the blocks in view
  # change only with a view switch or a block added or removed. A
  # reactiveVal ignores an identical value, so the row and the prompt are
  # not redone for each click on the board.
  in_view <- reactiveVal(character())

  observe(in_view(view_focus_blocks(board, view_data)))

  # A view switch moves the user's attention with it, so a click in another
  # view does not count.
  last_active <- reactive({
    id <- seen()
    if (length(id) && id %in% in_view()) id
  })

  clicked <- reactive({
    id <- last_active()
    if (length(id) && !dismissed() && !id %in% added()) id
  })

  live <- function(ids) intersect(ids, board_block_ids(board$board))

  # What the row under the composer shows. A reactiveVal ignores a value
  # identical to the one it holds, so the row is redrawn only when this
  # changes. Every panel activation changes `view_data()`, including the one
  # a press on the row causes by moving focus into the assistant's panel, and
  # a row redrawn under the pressed button loses the click.
  shown <- reactiveVal()

  observe(
    shown(
      list(
        clicked = clicked(),
        added = live(added()),
        in_view = in_view(),
        names = chr_ply(board_blocks(board$board), block_name)
      )
    )
  )

  list(
    in_view = in_view,
    shown = shown,
    # The prompt is told about the clicked block only while its tag shows.
    last_active = reactive(if (!dismissed()) last_active()),
    added = reactive(live(added())),
    # The @ menu sends the whole set it shows ticked. It shows the blocks in
    # view only, so a tag on any other block stays, in its place.
    set = function(ids) {
      ids <- as.character(unlist(ids))
      keep <- c(setdiff(isolate(added()), isolate(in_view())), ids)
      added(union(intersect(isolate(added()), keep), ids))
      invisible()
    },
    drop = function(id) {
      added(setdiff(isolate(added()), id))
      invisible()
    },
    dismiss = function() {
      dismissed(TRUE)
      invisible()
    },
    # A new or restored conversation starts without the blocks added with
    # the @. The clicked block stays: the board has not changed.
    reset = function() {
      added(character())
      invisible()
    }
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

# The row under the composer: the clicked block, the blocks added with the
# @, and the @ itself. Every click goes back to R as an input event, so the
# server owns the state and the row is redrawn from it.
focus_row <- function(ns, board, clicked, added, in_view) {

  blks <- board_blocks(board)

  if (!length(in_view) && !length(added)) {
    return(NULL)
  }

  tag <- function(id, input) {

    name <- block_name(blks[[id]])
    meta <- block_metadata(blks[[id]], fields = c("icon", "category"))
    # The tab's size of the mark, so the tag reads as a block, not a value.
    mark <- blockr.ui::block_mark(meta$icon, meta$category, size = 16)

    tags$span(
      class = "blockr-select__tag asst-focus-tag",
      `data-value` = id,
      mark,
      tags$span(class = "blockr-select__tag-label", name),
      tags$button(
        type = "button",
        class = "blockr-select__tag-remove",
        `aria-label` = paste("Leave out", name),
        `data-blockr-tooltip` = "Leave out",
        onclick = focus_js_event(ns(input), id),
        blockr.ui::small_icon("remove")
      )
    )
  }

  choices <- lapply(
    in_view,
    function(id) list(id = id, name = block_name(blks[[id]]))
  )

  div(
    class = "asst-focus-row",
    if (length(clicked)) tag(clicked, "focus_dismiss"),
    lapply(added, tag, input = "focus_drop"),
    if (length(in_view)) {
      tags$button(
        type = "button",
        class = "blockr-tool asst-focus-add",
        `aria-label` = "Add a block from this view",
        `data-blockr-tooltip` = "Add a block from this view",
        `data-input` = ns("focus_set"),
        `data-blocks` = jsonlite::toJSON(choices, auto_unbox = TRUE),
        `data-picked` = jsonlite::toJSON(as.character(added)),
        onclick = "Blockr.assistant.focusMenu(this)",
        "@"
      )
    }
  )
}

focus_js_event <- function(input, id) {
  sprintf(
    "event.stopPropagation(); Shiny.setInputValue(%s, %s, {priority: 'event'})",
    jsonlite::toJSON(input, auto_unbox = TRUE),
    jsonlite::toJSON(id, auto_unbox = TRUE)
  )
}

focus_dep <- function() {
  htmltools::htmlDependency(
    "blockr-assistant-focus",
    as.character(utils::packageVersion("blockr.assistant")),
    src = system.file("assets", package = "blockr.assistant"),
    script = "focus.js"
  )
}
