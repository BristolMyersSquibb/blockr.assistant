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

# dock's live view data for `brd`, with `focus` set on view `view` and the
# board's active view switched to it.
focus_view_data <- function(brd, view = "one", focus = NULL) {

  views <- board_views(brd)
  active_view(views) <- view
  grids <- board_grids(brd)

  if (!is.null(focus)) {
    grids[[view]][["focus"]] <- focus
  }

  list(views = views, grids = grids)
}

test_that("grid_screen_order puts each group's front tab first", {

  grid <- list(
    children = list(
      list(panels = c("p1"), active = "p1"),
      list(
        children = list(
          list(panels = c("p2", "p3", "p4"), active = "p3")
        )
      )
    )
  )

  expect_identical(grid_screen_order(grid), c("p1", "p3", "p2", "p4"))
  expect_identical(grid_screen_order(NULL), character())
})

test_that("view_focus_blocks offers the active view's blocks only", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)

  vd <- reactiveVal(focus_view_data(brd, "one"))
  expect_setequal(isolate(view_focus_blocks(board, vd)), c("a", "b", "c"))

  vd(focus_view_data(brd, "two"))
  expect_identical(isolate(view_focus_blocks(board, vd)), "d")

  # No dock reporting: every block on the board.
  expect_setequal(
    isolate(view_focus_blocks(board, NULL)), c("a", "b", "c", "d")
  )
})

test_that("the clicked block is suggested, and the assistant panel is not", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_null(st$suggested())

      vd(focus_view_data(brd, focus = "block_panel-b"))
      session$flushReact()
      expect_identical(st$suggested(), "b")

      # Clicking into the chat moves dock's focus to the assistant's panel.
      vd(focus_view_data(brd, focus = "ext_panel-assistant"))
      session$flushReact()
      expect_identical(st$suggested(), "b")

      # Nothing is sent until the suggestion is taken.
      expect_identical(st$prompt(), character())

      st$attach("b")
      session$flushReact()
      expect_identical(st$attached(), "b")
      expect_identical(st$prompt(), "b")
      expect_null(st$suggested())
    }
  )
})

test_that("a tag lasts one message and the model keeps it for the reply", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-a"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      st$attach("a")

      st$send()
      session$flushReact()

      expect_identical(st$attached(), character())
      expect_identical(st$prompt(), "a")
      # The suggestion stays away until the next click on a block.
      expect_null(st$suggested())

      st$release()
      session$flushReact()
      expect_identical(st$prompt(), character())

      # Back to the block from the assistant: suggested again.
      vd(focus_view_data(brd, focus = "ext_panel-assistant"))
      session$flushReact()
      vd(focus_view_data(brd, focus = "block_panel-a"))
      session$flushReact()
      expect_identical(st$suggested(), "a")
    }
  )
})

test_that("a dismissed suggestion returns with the next click on a block", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-a"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_identical(st$suggested(), "a")

      st$dismiss()
      session$flushReact()
      expect_null(st$suggested())

      vd(focus_view_data(brd, focus = "block_panel-c"))
      session$flushReact()
      expect_identical(st$suggested(), "c")
    }
  )
})

test_that("a block in another view is not suggested", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_identical(st$suggested(), "b")

      vd(focus_view_data(brd, "two"))
      session$flushReact()
      expect_null(st$suggested())
    }
  )
})

test_that("a tag whose block leaves the board drops out", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, NULL)
    },
    {
      st$set(list("a", "b"))
      session$flushReact()
      expect_identical(st$prompt(), c("a", "b"))

      board$board <- new_dock_board(blocks = c(a = new_dataset_block("iris")))
      session$flushReact()
      expect_identical(st$prompt(), "a")
      expect_identical(st$attached(), "a")
    }
  )
})

test_that("focus_row draws tags, the suggestion and the +", {

  brd <- focus_board()
  ns <- NS("asst")

  html <- as.character(
    focus_row(ns, brd, attached = "a", suggested = "b", in_view = c("a", "b"))
  )

  expect_match(html, "blockr-select__tag asst-focus-tag\"", fixed = TRUE)
  expect_match(html, "asst-focus-tag--suggested", fixed = TRUE)
  expect_match(html, "asst-focus_take", fixed = TRUE)
  expect_match(html, "asst-focus_dismiss", fixed = TRUE)
  expect_match(html, "asst-focus_drop", fixed = TRUE)
  expect_match(html, "data-input=\"asst-focus_set\"", fixed = TRUE)
  expect_no_match(html, "asst-focus-row--bare", fixed = TRUE)

  bare <- as.character(
    focus_row(ns, brd, attached = character(), suggested = NULL,
              in_view = "a")
  )
  expect_match(bare, "asst-focus-row--bare", fixed = TRUE)

  expect_null(
    focus_row(ns, brd, attached = character(), suggested = NULL,
              in_view = character())
  )
})
