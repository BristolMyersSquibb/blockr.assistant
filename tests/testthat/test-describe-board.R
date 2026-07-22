test_that("summarise_board marks the live active view from view_data", {

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    views = list(
      v_main = dock_view("a", name = "Analysis"),
      v_over = dock_view("a", name = "Overview")
    )
  )

  live_views <- board_views(brd)
  active_view(live_views) <- "v_over"
  vd <- reactiveVal(list(views = live_views, grids = board_grids(brd)))

  board <- reactiveValues(board = brd)

  res <- summarise_board(board, view_data = vd)
  expect_match(res, "- Overview (id: v_over) (active)", fixed = TRUE)
  expect_no_match(res, "(id: v_main) (active)", fixed = TRUE)

  prompt <- default_system_prompt(board = board, view_data = vd)
  expect_match(prompt, "- Overview (id: v_over) (active)", fixed = TRUE)
})

test_that("summarise_board on empty board returns the empty-flag line", {

  board <- reactiveValues(board = new_board())
  res <- summarise_board(board)

  expect_match(res, "(empty board -- no blocks yet)", fixed = TRUE)
})

test_that("summarise_board on a populated board emits per-entity lines", {

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris"), h = new_head_block()),
    links  = c(l = new_link("d", "h", "data"))
  )
  board <- reactiveValues(board = brd)

  res <- summarise_board(board)

  expect_match(res, "2 block(s), 1 link(s)", fixed = TRUE)
  expect_match(res, "### Blocks", fixed = TRUE)
  expect_match(res, "d <dataset_block>", fixed = TRUE)
  expect_match(res, "h <head_block>", fixed = TRUE)
  expect_match(res, "### Links", fixed = TRUE)
  expect_match(res, "l: d -> h$data", fixed = TRUE)
})

test_that("summarise_board lists the board's options with categories", {

  brd <- new_board(
    blocks  = c(d = new_dataset_block("iris")),
    options = new_board_options(
      new_board_name_option(),
      new_n_rows_option(50L)
    )
  )
  board <- reactiveValues(board = brd)

  res <- summarise_board(board)

  expect_match(res, "### Options", fixed = TRUE)
  expect_match(res, "- board_name (Board options)", fixed = TRUE)
  expect_match(res, "- n_rows (Table options)", fixed = TRUE)
  expect_match(res, "Current values via list_board_options", fixed = TRUE)
})

test_that("summarise_board flags unhealthy blocks, not healthy ones", {

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris"), h = new_head_block())
  )
  board <- reactiveValues(
    board = brd,
    blocks = list(d = list(), h = list()),
    conditions = reactiveVal(cnd_frame(cnd_row("d", "error", "boom")))
  )

  lines <- strsplit(summarise_board(board), "\n")[[1]]
  d_line <- grep("d <dataset_block>", lines, fixed = TRUE, value = TRUE)
  h_line <- grep("h <head_block>", lines, fixed = TRUE, value = TRUE)

  expect_match(d_line, "1 error", fixed = TRUE)
  expect_no_match(h_line, "error", fixed = TRUE)
})

test_that("summarise_board trims a section without starving later ones", {

  withr::local_options(blockr.assistant_board_section_max_chars = 300L)

  ids <- paste0("block_id_", seq_len(40))
  blks <- setNames(lapply(ids, function(i) new_dataset_block("iris")), ids)
  brd <- new_dock_board(
    blocks = blks,
    views = list(
      v1 = dock_view(ids[1:2], name = "One"),
      v2 = dock_view(ids[1:2], name = "Two")
    )
  )
  board <- reactiveValues(board = brd)

  res <- summarise_board(board)

  expect_match(res, "### Blocks", fixed = TRUE)
  expect_match(res, "call list_blocks for the full list", fixed = TRUE)
  expect_match(res, "### Views", fixed = TRUE)
  expect_no_match(res, "call list_views", fixed = TRUE)
})

test_that("summarise_board leaves a within-budget summary untouched", {

  board <- reactiveValues(
    board = new_board(blocks = c(d = new_dataset_block("iris")))
  )

  expect_no_match(summarise_board(board), "truncated", fixed = TRUE)
})

test_that("summarise_board honours the board_section_max_chars option", {

  withr::local_options(blockr.assistant_board_section_max_chars = 30L)

  ids <- paste0("blk_", seq_len(20))
  board <- reactiveValues(
    board = new_board(
      blocks = setNames(lapply(ids, function(i) new_head_block()), ids)
    )
  )

  res <- summarise_board(board)

  expect_match(res, "truncated", fixed = TRUE)
  expect_match(res, "call list_blocks for the full list", fixed = TRUE)
})

board_with_summary_ext <- function(description = NULL, external_ctrl = FALSE) {
  ext <- new_dock_extension(
    server = function(id, ...) {
      moduleServer(id, function(input, output, session) list(state = list()))
    },
    ui = function(id) tagList(),
    name = "Workflow",
    description = description,
    class = "workflow_extension",
    ctor = function(positions = NULL) NULL,
    external_ctrl = external_ctrl
  )

  new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    extensions = list(workflow = ext)
  )
}

test_that("summarise_board lists a described, controllable extension", {

  board <- reactiveValues(
    board = board_with_summary_ext(
      description = "Node positions; move via modify_extension(positions).",
      external_ctrl = "positions"
    )
  )

  res <- summarise_board(board)

  expect_match(res, "### Extensions", fixed = TRUE)
  expect_match(res, "- Workflow (id: workflow)", fixed = TRUE)
  expect_match(res, "controllable: positions", fixed = TRUE)
  expect_match(
    res,
    "Node positions; move via modify_extension(positions).",
    fixed = TRUE
  )
})

test_that("summarise_board omits a bare extension (no desc/ctrl)", {

  board <- reactiveValues(
    board = board_with_summary_ext(description = NULL, external_ctrl = FALSE)
  )

  expect_no_match(summarise_board(board), "### Extensions", fixed = TRUE)
})
