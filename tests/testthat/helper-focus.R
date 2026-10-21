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

# dock's live view data for `brd`, with the active view switched to `view`.
focus_view_data <- function(brd, view = "one") {

  views <- board_views(brd)
  active_view(views) <- view

  list(views = views, grids = board_grids(brd))
}
