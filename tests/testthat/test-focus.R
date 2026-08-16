focus_board <- function() {
  new_dock_board(
    blocks = c(
      data = new_dataset_block("iris"),
      filt = new_subset_block(subset = "Sepal.Length > 5")
    ),
    links = c(new_link("data", "filt", "data")),
    extensions = list(assistant = new_assistant_extension())
  )
}

# The `list(views, grids)` shape blockr.dock's `view_data` reactive holds, with
# `focus` set to the panel the client reports as focused.
focus_view_data <- function(brd, focus = NULL) {

  views <- board_views(brd)
  grids <- board_grids(brd)
  vid   <- active_view(views)

  grid <- grids[[vid]]
  grid[["focus"]] <- focus
  grids[[vid]] <- grid

  list(views = views, grids = grids)
}

test_that("focused_panel reads the active view's focus", {

  brd <- focus_board()

  expect_null(focused_panel(function() NULL))
  expect_null(focused_panel(function() focus_view_data(brd)))

  expect_identical(
    focused_panel(function() focus_view_data(brd, "block_panel-filt")),
    "block_panel-filt"
  )
})

test_that("is_block_panel tells block panels from extension ones", {
  expect_true(is_block_panel("block_panel-filt"))
  expect_false(is_block_panel("ext_panel-assistant"))
})

test_that("the tracker records the block panel the user focuses", {

  brd <- focus_board()

  testServer(
    function(input, output, session) {
      board <- reactiveValues(board = brd)
      vd <- reactiveVal(focus_view_data(brd))
      focus <- new_focus_tracker(board, vd)
    },
    {
      session$flushReact()
      expect_null(focus$get())

      vd(focus_view_data(brd, "block_panel-filt"))
      session$flushReact()
      expect_identical(focus$get(), "filt")

      vd(focus_view_data(brd, "block_panel-data"))
      session$flushReact()
      expect_identical(focus$get(), "data")
    }
  )
})

test_that("focusing the chat panel leaves the selection alone", {

  brd <- focus_board()

  testServer(
    function(input, output, session) {
      board <- reactiveValues(board = brd)
      vd <- reactiveVal(focus_view_data(brd, "block_panel-filt"))
      focus <- new_focus_tracker(board, vd)
    },
    {
      session$flushReact()
      expect_identical(focus$get(), "filt")

      # What clicking into the message box does: the assistant's own panel
      # takes focus, and the block the user picked on the way there has to
      # survive it.
      vd(focus_view_data(brd, "ext_panel-assistant"))
      session$flushReact()
      expect_identical(focus$get(), "filt")
    }
  )
})

test_that("a cleared selection stays cleared until another block is picked", {

  brd <- focus_board()

  testServer(
    function(input, output, session) {
      board <- reactiveValues(board = brd)
      vd <- reactiveVal(focus_view_data(brd, "block_panel-filt"))
      focus <- new_focus_tracker(board, vd)
    },
    {
      session$flushReact()
      expect_identical(focus$get(), "filt")

      focus$clear()
      session$flushReact()
      expect_null(focus$get())

      # dock's focus has not moved, so the echo it repeats must not undo the
      # dismissal.
      vd(focus_view_data(brd, "block_panel-filt"))
      session$flushReact()
      expect_null(focus$get())

      vd(focus_view_data(brd, "block_panel-data"))
      session$flushReact()
      expect_identical(focus$get(), "data")

      vd(focus_view_data(brd, "block_panel-filt"))
      session$flushReact()
      expect_identical(focus$get(), "filt")
    }
  )
})

test_that("a selected block removed from the board drops the selection", {

  # Link-free: a linked block cannot be removed in one call, and the link
  # teardown is core's business rather than this test's.
  brd <- new_dock_board(
    blocks = c(
      data = new_dataset_block("iris"),
      filt = new_subset_block(subset = "Sepal.Length > 5")
    ),
    extensions = list(assistant = new_assistant_extension())
  )

  testServer(
    function(input, output, session) {
      board <- reactiveValues(board = brd)
      vd <- reactiveVal(focus_view_data(brd, "block_panel-filt"))
      focus <- new_focus_tracker(board, vd)
    },
    {
      session$flushReact()
      expect_identical(focus$get(), "filt")

      board$board <- rm_blocks(brd, "filt")
      session$flushReact()
      expect_null(focus$get())
    }
  )
})

test_that("focus_chip renders the block id and name, or nothing", {

  brd <- focus_board()
  board <- list(board = brd)
  ns <- NS("asst")

  expect_null(focus_chip(NULL, board, ns))
  expect_null(focus_chip("gone", board, ns))

  html <- as.character(focus_chip("filt", board, ns))

  expect_match(html, "asst-focus", fixed = TRUE)
  expect_match(html, ">filt<", fixed = TRUE)
  expect_match(html, "Subset", fixed = TRUE)
  expect_match(html, "asst-focus_clear", fixed = TRUE)
})

test_that("describe_focus reports the selected block, or nothing", {

  board <- list(board = focus_board())

  expect_null(describe_focus(NULL, board))
  expect_null(describe_focus("gone", board))

  res <- describe_focus("filt", board)

  expect_match(res, "`filt`", fixed = TRUE)
  expect_match(res, "subset_block", fixed = TRUE)
})

test_that("the prompt carries a Selected block section only when selected", {

  board <- list(board = focus_board())

  expect_no_match(
    default_system_prompt(board = board), "## Selected block",
    fixed = TRUE
  )

  expect_no_match(
    default_system_prompt(board = board, focus = "gone"), "## Selected block",
    fixed = TRUE
  )

  # No board to resolve the id against is no section either.
  expect_no_match(
    default_system_prompt(focus = "filt"), "## Selected block",
    fixed = TRUE
  )

  res <- default_system_prompt(board = board, focus = "filt")

  expect_match(res, "## Selected block", fixed = TRUE)

  # Last, after the board summary it refers to.
  expect_gt(
    regexpr("## Selected block", res, fixed = TRUE),
    regexpr("## Board", res, fixed = TRUE)
  )
})
