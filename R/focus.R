# Which blocks the next message is about. The user points at a block by
# clicking it on the board: the block last made active is offered
# under the composer as a suggested tag, which is not sent until the user
# clicks it. A tag taken from the suggestion applies to one message: sending
# clears it from the composer, and the model keeps it in its prompt until its
# reply is done. A block picked with the + stays until it is taken off.
#
# `panel` is the panel the user last made active, as dockViewR announces it
# in the browser (see focus.js). dock's own `focus` on `view_data()` cannot
# serve: it drops the first panel group, which dockview also activates by
# default on load. The chat panel is a dock panel too, so clicking into the
# message box makes the assistant active: only block panels are read, so the
# block clicked on the way to the composer survives the trip.
new_focus_state <- function(board, view_data, panel) {

  seen      <- reactiveVal(NULL)
  dismissed <- reactiveVal(NULL)
  attached  <- reactiveVal(character())
  # The tags taken from the suggestion, which sending clears.
  once      <- reactiveVal(character())
  held      <- reactiveVal(character())

  # dockview announces a change of the active panel only, so every block
  # announced is a fresh click on it, including a click back from the
  # assistant's own panel. That is what lets a dismissed suggestion return
  # with a click on its block.
  observeEvent(panel(), {

    pid <- panel()

    if (!is_block_panel(pid)) {
      return()
    }

    seen(panel_obj_ids(pid))
    dismissed(NULL)
  })

  in_view <- reactive(view_focus_blocks(board, view_data))

  suggested <- reactive({

    id <- seen()

    if (is.null(id) || identical(id, dismissed()) || id %in% attached() ||
          !id %in% in_view()) {
      return(NULL)
    }

    id
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
        attached = live(attached()),
        suggested = suggested(),
        in_view = in_view(),
        names = chr_ply(board_blocks(board$board), block_name)
      )
    )
  )

  list(
    attached = reactive(live(attached())),
    suggested = suggested,
    in_view = in_view,
    shown = shown,
    # What the prompt is told: the tags of the message in flight plus any
    # the user has already put on the next one.
    prompt = reactive(live(union(held(), attached()))),
    attach = function(id) {
      if (length(id) == 1L && nzchar(id)) {
        attached(union(isolate(attached()), id))
        once(union(isolate(once()), id))
      }
      invisible()
    },
    # The + menu sends the whole set it shows ticked. It shows the blocks in
    # view only, so a tag on any other block stays, and the tags kept stay
    # in their place. A tag the menu adds is a pick, which sending keeps.
    set = function(ids) {
      ids <- as.character(unlist(ids))
      keep <- c(setdiff(isolate(attached()), isolate(in_view())), ids)
      attached(union(intersect(isolate(attached()), keep), ids))
      once(intersect(isolate(once()), isolate(attached())))
      invisible()
    },
    drop = function(id) {
      attached(setdiff(isolate(attached()), id))
      once(setdiff(isolate(once()), id))
      invisible()
    },
    dismiss = function() {
      dismissed(isolate(seen()))
      invisible()
    },
    # A user message went out: its tags move to the prompt for the turn, the
    # ones taken from the suggestion leave the composer, and the suggestion
    # stays away until the next click on a block.
    send = function() {
      held(isolate(attached()))
      attached(setdiff(isolate(attached()), isolate(once())))
      once(character())
      dismissed(isolate(seen()))
      invisible()
    },
    # The model's reply is done.
    release = function() {
      held(character())
      invisible()
    },
    reset = function() {
      held(character())
      attached(character())
      once(character())
      dismissed(isolate(seen()))
      invisible()
    }
  )
}

is_block_panel <- function(x) {
  is.character(x) && length(x) == 1L && startsWith(x, "block_panel-")
}

# The blocks in the active view, in screen order: panel group by panel group,
# each group's tabs as they sit in its tab strip. Not the front tab first,
# which would change the order, and redraw the tags, with every tab switch.
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

# The row under the composer: the message's tags, the suggestion, and the +
# that adds any other block in the view. Every click goes back to R as an
# input event, so the server owns the state and the row is redrawn from it.
focus_row <- function(ns, board, attached, suggested, in_view) {

  blks <- board_blocks(board)

  if (!length(in_view) && !length(attached)) {
    return(NULL)
  }

  tag <- function(id, suggested = FALSE) {

    name <- block_name(blks[[id]])
    meta <- block_metadata(blks[[id]], fields = c("icon", "category"))
    # The tab's size of the mark, so the tag reads as a block, not a value.
    mark <- blockr.ui::block_mark(meta$icon, meta$category, size = 16)

    remove <- tags$button(
      type = "button",
      class = "blockr-select__tag-remove",
      `aria-label` = paste(if (suggested) "Hide" else "Remove", name),
      `data-blockr-tooltip` = if (suggested) "Hide" else "Remove",
      onclick = focus_js_event(
        ns(if (suggested) "focus_dismiss" else "focus_drop"), id
      ),
      blockr.ui::small_icon("remove")
    )

    if (suggested) {
      tags$span(
        class = "blockr-select__tag asst-focus-tag asst-focus-tag--suggested",
        role = "button",
        tabindex = "0",
        `data-value` = id,
        `data-blockr-tooltip` = "Ask about this block",
        onclick = focus_js_event(ns("focus_take"), id),
        # Keys on the x inside bubble up to here, and must keep the x's own
        # meaning: Enter there hides the suggestion rather than taking it.
        onkeydown = paste0(
          "if (event.target === this && ",
          "(event.key === 'Enter' || event.key === ' ')) {",
          " event.preventDefault(); this.click(); }"
        ),
        mark,
        tags$span(class = "blockr-select__tag-label", name),
        remove
      )
    } else {
      tags$span(
        class = "blockr-select__tag asst-focus-tag",
        `data-value` = id,
        mark,
        tags$span(class = "blockr-select__tag-label", name),
        remove
      )
    }
  }

  choices <- lapply(
    in_view,
    function(id) list(id = id, name = block_name(blks[[id]]))
  )

  div(
    class = "asst-focus-row",
    `data-panel-input` = ns("focus_panel"),
    lapply(attached, tag),
    if (length(suggested)) tag(suggested, suggested = TRUE),
    if (length(in_view)) {
      tags$button(
        type = "button",
        class = "blockr-tool asst-focus-add",
        `aria-label` = "Add a block from this view",
        `data-blockr-tooltip` = "Add a block from this view",
        `data-input` = ns("focus_set"),
        `data-blocks` = jsonlite::toJSON(choices, auto_unbox = TRUE),
        `data-picked` = jsonlite::toJSON(as.character(attached)),
        onclick = "Blockr.assistant.focusMenu(this)",
        blockr.ui::small_icon("plus")
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
