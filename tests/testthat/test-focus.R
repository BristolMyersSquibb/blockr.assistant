test_that("grid_screen_order keeps each group's tabs in strip order", {

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

  expect_identical(grid_screen_order(grid), c("p1", "p2", "p3", "p4"))
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

test_that("the clicked block is the last active, and the assistant is not", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_null(st$last_active())

      vd(focus_view_data(brd, focus = "block_panel-b"))
      session$flushReact()
      expect_identical(st$last_active(), "b")

      # Clicking into the chat makes the assistant's panel the focus.
      vd(focus_view_data(brd, focus = "ext_panel-assistant"))
      session$flushReact()
      expect_identical(st$last_active(), "b")

      vd(focus_view_data(brd, focus = "block_panel-c"))
      session$flushReact()
      expect_identical(st$last_active(), "c")
    }
  )
})

test_that("each view keeps the block last clicked in it", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_identical(st$last_active(), "b")
      expect_identical(st$in_view(), c("a", "b", "c"))

      vd(focus_view_data(brd, "two"))
      session$flushReact()
      expect_null(st$last_active())
      expect_identical(st$in_view(), "d")

      vd(focus_view_data(brd, "two", focus = "block_panel-d"))
      session$flushReact()
      expect_identical(st$last_active(), "d")

      # Back again, the click there still stands, though the dock now
      # reports the assistant's panel, where the user clicked last.
      vd(focus_view_data(brd, "one", focus = "ext_panel-assistant"))
      session$flushReact()
      expect_identical(st$last_active(), "b")
    }
  )
})

test_that("the blocks in view change with the view, not with every click", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)

  # As dock reports its live layout: `a` in a group of its own, `b` and `c`
  # tabbed in another. The `focus` moves to the assistant's panel when the
  # user clicks into the chat, and `front` with a tab switch.
  layout <- function(focus, front = "block_panel-b") {
    vd <- focus_view_data(brd)
    vd$grids <- list(
      one = list(
        children = list(
          list(panels = "block_panel-a", active = "block_panel-a"),
          list(panels = c("block_panel-b", "block_panel-c"), active = front)
        ),
        focus = focus
      )
    )
    vd
  }

  vd <- reactiveVal(layout("block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
      # An environment, as the test sees a copy of plain bindings.
      seen <- new.env()
      seen$n <- 0L
      observe({
        st$in_view()
        seen$n <- seen$n + 1L
      })
    },
    {
      session$flushReact()
      before <- seen$n

      vd(layout("ext_panel-assistant"))
      session$flushReact()
      expect_identical(seen$n, before)

      vd(layout("ext_panel-assistant", front = "block_panel-c"))
      session$flushReact()
      expect_identical(seen$n, before)

      vd(focus_view_data(brd, "two"))
      session$flushReact()
      expect_identical(seen$n, before + 1L)
    }
  )
})

test_that("a last active block that leaves the board drops out", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_identical(st$last_active(), "b")

      board$board <- new_dock_board(blocks = c(a = new_dataset_block("iris")))
      session$flushReact()
      expect_null(st$last_active())
      expect_identical(st$in_view(), "a")
    }
  )
})

test_that("the x leaves the clicked block out until the next click", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      expect_identical(st$shown()$clicked, "b")

      st$dismiss()
      session$flushReact()
      expect_null(st$shown()$clicked)
      expect_null(st$last_active())

      vd(focus_view_data(brd, focus = "ext_panel-assistant"))
      session$flushReact()
      expect_null(st$shown()$clicked)

      vd(focus_view_data(brd, focus = "block_panel-b"))
      session$flushReact()
      expect_identical(st$shown()$clicked, "b")
      expect_identical(st$last_active(), "b")
    }
  )
})

test_that("the @ changes the added blocks in view only", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, "two"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      session$flushReact()
      st$set(list("d"))

      vd(focus_view_data(brd, "one"))
      session$flushReact()

      st$set(list("b", "c"))
      session$flushReact()
      expect_identical(st$added(), c("d", "b", "c"))

      st$set(list("c"))
      session$flushReact()
      expect_identical(st$added(), c("d", "c"))

      # The emptied menu's NULL.
      st$set(NULL)
      session$flushReact()
      expect_identical(st$added(), "d")

      st$reset()
      session$flushReact()
      expect_identical(st$added(), character())
    }
  )
})

test_that("a clicked block that is also added shows once", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)
  vd <- reactiveVal(focus_view_data(brd, focus = "block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
    },
    {
      st$set(list("b"))
      session$flushReact()
      expect_null(st$shown()$clicked)
      expect_identical(st$shown()$added, "b")
    }
  )
})

test_that("the row redraws for what it shows, not for every layout change", {

  brd <- focus_board()
  board <- reactiveValues(board = brd)

  layout <- function(focus, front = "block_panel-b") {
    vd <- focus_view_data(brd)
    vd$grids <- list(
      one = list(
        children = list(
          list(panels = "block_panel-a", active = "block_panel-a"),
          list(panels = c("block_panel-b", "block_panel-c"), active = front)
        ),
        focus = focus
      )
    )
    vd
  }

  vd <- reactiveVal(layout("block_panel-b"))

  testServer(
    function(input, output, session) {
      st <- new_focus_state(board, vd)
      drawn <- new.env()
      drawn$n <- 0L
      observe({
        st$shown()
        drawn$n <- drawn$n + 1L
      })
    },
    {
      session$flushReact()
      before <- drawn$n

      # A press on the row moves focus into the assistant's panel.
      vd(layout("ext_panel-assistant"))
      session$flushReact()
      expect_identical(drawn$n, before)

      vd(layout("ext_panel-assistant", front = "block_panel-c"))
      session$flushReact()
      expect_identical(drawn$n, before)

      vd(layout("block_panel-c", front = "block_panel-c"))
      session$flushReact()
      expect_identical(drawn$n, before + 1L)
    }
  )
})

test_that("focus_row draws the clicked tag, the added tags and the @", {

  brd <- focus_board()
  ns <- NS("x")

  html <- as.character(
    focus_row(ns, brd, clicked = "b", added = "c", in_view = c("a", "b", "c"))
  )

  expect_match(html, "x-focus_dismiss", fixed = TRUE)
  expect_match(html, "x-focus_drop", fixed = TRUE)
  expect_match(html, ">@</button>", fixed = TRUE)
  expect_no_match(html, "suggested", fixed = TRUE)

  expect_null(
    focus_row(ns, brd, clicked = NULL, added = character(),
              in_view = character())
  )
})
