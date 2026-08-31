# Clicking a block fills the focus picker below the chat. The signal is already
# published: dockView echoes its layout on every gesture, dock folds that into
# the live grid of each view, and `view_data` is handed to every extension
# server. So this reads what dock says rather than opening a channel of its
# own, and needs nothing from blockr.dock.
#
# What it reads is which block is *at the front*. A grid leaf is a tab group and
# carries the panel it is showing (`active`); bringing a block to the front is
# what a user does to work on it, whether by clicking its tab or by clicking the
# card of a background panel. The grid's `focus` -- the panel of the group
# dockView calls active -- would be the more direct signal, but dock drops it
# for the load-default group id `"1"` (`focus_panel()`), which is the only group
# a single-group board ever has. On the common board it is therefore never
# reported, so it is used when present and the front-most block carries the
# rest.
#
# Two things stand between the signal and what the user means:
#
#  * The chat panel is a dock panel too, so clicking into the message box makes
#    the assistant's own panel active. Only block panels are recorded, so the
#    block fronted on the way to the input box survives, which is the one that
#    matters.
#  * A selection the user removed has to stay removed. Holding the pick in a
#    `reactiveVal` gives that for free: dock re-echoes its layout on any change,
#    and writing the same id back does not invalidate, so an emptied picker is
#    not refilled behind the user's back. The cost is that re-picking the block
#    just removed takes a visit to another block and back, since re-fronting the
#    front-most block is not a change and echoes nothing.
#
# The first echo is recorded and not acted on. A board boots with a panel at the
# front without anyone having clicked it, and scoping the assistant to whichever
# block happened to open first would be a selection the user never made.
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
