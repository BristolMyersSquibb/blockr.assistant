# A dock board with two views, for the focus tests.
focus_board <- function() {
  new_dock_board(
    blocks = c(
      a = new_dataset_block("iris"),
      b = new_head_block(),
      c = new_head_block(),
      d = new_head_block()
    ),
    views = list(
      one = dock_view(c("a", "b", "c"), name = "One"),
      two = dock_view("d", name = "Two")
    ),
    active = "one"
  )
}

# The dock's live view data for `brd`, with the active view switched to
# `view` and, if given, `focus` as the panel the dock reports focused there.
focus_view_data <- function(brd, view = "one", focus = NULL) {

  views <- board_views(brd)
  active_view(views) <- view

  grids <- unclass(board_grids(brd))

  if (!is.null(focus)) {
    grids[[view]] <- c(as.list(grids[[view]]), list(focus = focus))
  }

  list(views = views, grids = grids)
}
