# Which block the assistant is scoped to follows the block the user clicks.
# There are two signals, because neither covers the whole board on its own.
#
# The click itself comes from the DOM (`inst/js/click-focus.js`), keyed on the
# card's block handle id. It is the only one that fires for a click on a block
# already on screen beside another, which is the common shape of a working
# board.
#
# The other is what dock publishes. dockView echoes its layout on every
# gesture, dock folds that into each view's live grid, and `view_data` reaches
# every extension server, so bringing a block to the front by its tab shows up
# there as a change in which panel each tab group is showing. It also carries
# the grid's `focus` when dock reports one, which it does not on a single-group
# board: dockView names the first group "1" and dock reads "1" as "no focus"
# (`focus_panel()`), so the first group can never hold it.
#
# Two things stand between the dock signal and what the user means:
#
#  * The chat panel is a dock panel too, so clicking into the message box
#    fronts the assistant's own panel. Only block panels are recorded, so the
#    block fronted on the way to the input box survives.
#  * A selection the user removed has to stay removed. Holding the pick in a
#    `reactiveVal` gives that for free: dock re-echoes its layout on any change,
#    and writing the same id back does not invalidate, so an emptied picker is
#    not refilled behind the user's back. Clicking the block again does refill
#    it, which is the DOM signal, and is what the user just asked for.
#
# The first echo is recorded and not acted on. A board boots with a panel at
# the front without anyone having clicked it, and scoping the assistant to
# whichever block happened to open first would be a selection nobody made.
click_focus <- function(view_data) {

  clicked <- reactiveVal(NULL)
  fronted <- NULL

  observe({

    grid <- active_view_grid(view_data)

    if (is.null(grid)) {
      return()
    }

    now  <- fronted_block_ids(grid)
    seen <- fronted
    fronted <<- now

    if (is.null(seen)) {
      return()
    }

    id <- focused_block_id(grid)

    if (is.null(id)) {
      new <- setdiff(now, seen)
      # More than one block arriving at once is a view switch or a restore, not
      # a click, and there is no one block to point at.
      id <- if (length(new) == 1L) new else NULL
    }

    if (is.null(id)) {
      return()
    }

    clicked(id)
  })

  clicked
}

# The live compact grid of the active view, or NULL before any dock has
# reported. Reactive on `view_data`, which is how the caller's observer follows
# the user's clicks.
active_view_grid <- function(view_data) {

  live <- if (is.function(view_data)) view_data() else NULL

  if (is.null(live)) {
    return(NULL)
  }

  active <- tryCatch(active_view(live[["views"]]), error = function(e) NULL)

  if (is.null(active) || is.na(active) || !nzchar(active)) {
    return(NULL)
  }

  live[["grids"]][[active]]
}

# The block a grid marks focused, or NULL when it marks none or marks an
# extension panel.
focused_block_id <- function(grid) {
  as_block_ids(grid[["focus"]])
}

# The front-most panel of every tab group in a grid, as block ids. A block in a
# background tab is not one of them: it is not on screen, and fronting it is the
# gesture this watches for.
fronted_block_ids <- function(grid) {

  fronts <- character()

  walk <- function(node) {

    if (!is.null(node[["panels"]])) {
      fronts <<- c(fronts, as.character(node[["active"]]))
      return(invisible())
    }

    lapply(node[["children"]], walk)

    invisible()
  }

  lapply(grid[["children"]], walk)

  as_block_ids(fronts)
}

# Panel ids to block ids, dropping whatever is not a block panel.
as_block_ids <- function(ids) {

  ids <- as.character(ids)
  ids <- ids[!is.na(ids) & nzchar(ids)]

  if (!length(ids)) {
    return(NULL)
  }

  ids <- ids[grepl("^block_panel-", ids)]

  if (!length(ids)) {
    return(NULL)
  }

  as.character(panel_obj_ids(ids))
}

# The click listener, and the element it reads the input id from. A marker in
# the DOM rather than a namespace baked into the script, so the script is one
# static asset however many boards a page carries.
asst_click_focus_ui <- function(id) {
  tagList(
    asst_click_focus_dep(),
    div(
      class = "asst-card-click",
      `data-input-id` = NS(id, "card_click"),
      style = "display: none;"
    )
  )
}

asst_click_focus_dep <- function() {
  htmltools::htmlDependency(
    "asst-click-focus",
    utils::packageVersion("blockr.assistant"),
    src = system.file("js", package = "blockr.assistant"),
    script = "click-focus.js"
  )
}
