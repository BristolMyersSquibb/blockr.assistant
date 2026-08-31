focus_click_board <- function() {
  new_dock_board(
    blocks = c(
      data = new_dataset_block("iris"),
      filt = new_subset_block(subset = "Sepal.Length > 5")
    ),
    links = c(new_link("data", "filt", "data")),
    extensions = list(assistant = new_assistant_extension())
  )
}

# The `list(views, grids)` shape blockr.dock's `view_data` reactive holds.
# `front` is the panel the client reports at the front of the (single) tab
# group, and `focus` the panel dock marks focused -- which a single-group board
# never has.
focus_click_data <- function(brd, front = NULL, focus = NULL) {

  views <- board_views(brd)
  grids <- board_grids(brd)
  vid   <- active_view(views)

  grid <- grids[[vid]]

  panels <- c("block_panel-data", "block_panel-filt", "ext_panel-assistant")

  grid[["children"]] <- list(
    list(panels = panels, active = front %||% panels[[1L]])
  )
  grid[["sizes"]] <- 1
  grid[["focus"]] <- focus

  grids[[vid]] <- grid

  list(views = views, grids = grids)
}

test_that("fronted_block_ids reads each group's front panel", {

  brd <- focus_click_board()

  grid <- active_view_grid(
    function() focus_click_data(brd, front = "block_panel-filt")
  )

  expect_identical(fronted_block_ids(grid), "filt")

  grid <- active_view_grid(
    function() focus_click_data(brd, front = "ext_panel-assistant")
  )

  expect_null(fronted_block_ids(grid))
})

test_that("active_view_grid is NULL before a dock has reported", {
  expect_null(active_view_grid(NULL))
  expect_null(active_view_grid(function() NULL))
})

test_that("fronting a block reports it as the pick", {

  brd <- focus_click_board()

  testServer(
    function(input, output, session) {
      vd <- reactiveVal(focus_click_data(brd, front = "block_panel-data"))
      session$userData$vd <- vd
      session$userData$clicked <- click_focus(vd)
    },
    {
      # The panel at the front on boot was not clicked by anyone.
      session$flushReact()
      expect_null(session$userData$clicked())

      session$userData$vd(focus_click_data(brd, front = "block_panel-filt"))
      session$flushReact()
      expect_identical(session$userData$clicked(), "filt")

      session$userData$vd(focus_click_data(brd, front = "block_panel-data"))
      session$flushReact()
      expect_identical(session$userData$clicked(), "data")
    }
  )
})

test_that("dock's own focus wins when it reports one", {

  brd <- focus_click_board()

  testServer(
    function(input, output, session) {
      vd <- reactiveVal(focus_click_data(brd, front = "block_panel-data"))
      session$userData$vd <- vd
      session$userData$clicked <- click_focus(vd)
    },
    {
      session$flushReact()

      session$userData$vd(
        focus_click_data(
          brd, front = "block_panel-data", focus = "block_panel-filt"
        )
      )
      session$flushReact()
      expect_identical(session$userData$clicked(), "filt")
    }
  )
})

test_that("fronting the chat panel leaves the selection alone", {

  brd <- focus_click_board()

  testServer(
    function(input, output, session) {
      vd <- reactiveVal(focus_click_data(brd, front = "block_panel-data"))
      session$userData$vd <- vd
      session$userData$clicked <- click_focus(vd)
    },
    {
      session$flushReact()

      session$userData$vd(focus_click_data(brd, front = "block_panel-filt"))
      session$flushReact()
      expect_identical(session$userData$clicked(), "filt")

      session$userData$vd(focus_click_data(brd, front = "ext_panel-assistant"))
      session$flushReact()
      expect_identical(session$userData$clicked(), "filt")
    }
  )
})

test_that("a re-echo of the same layout does not fire again", {

  brd <- focus_click_board()

  testServer(
    function(input, output, session) {
      vd <- reactiveVal(focus_click_data(brd, front = "block_panel-data"))
      fired <- reactiveVal(0L)
      clicked <- click_focus(vd)

      observeEvent(clicked(), fired(isolate(fired()) + 1L))

      session$userData$vd <- vd
      session$userData$fired <- fired
    },
    {
      session$flushReact()

      session$userData$vd(focus_click_data(brd, front = "block_panel-filt"))
      session$flushReact()
      expect_identical(session$userData$fired(), 1L)

      # dock re-echoes its layout on any change. The user may have emptied the
      # picker in between, so this must not fire again.
      session$userData$vd(focus_click_data(brd, front = "block_panel-filt"))
      session$flushReact()
      expect_identical(session$userData$fired(), 1L)
    }
  )
})
