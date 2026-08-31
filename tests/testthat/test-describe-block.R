make_iris_board <- function() {
  new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block()
    ),
    links = c(new_link("data", "head", "data"))
  )
}

test_that("default describe_block.block surfaces class, args, links", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["head"]]

  res <- describe_block(blk, board = brd, id = "head")

  expect_type(res, "character")
  expect_gt(length(res), 1L)

  text <- paste(res, collapse = "\n")
  expect_match(text, "head", fixed = TRUE)
  expect_match(text, "Incoming links", fixed = TRUE)
  expect_match(text, "data", fixed = TRUE)
})

test_that("describe_block reports 'none' when there are no incoming links", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]

  res <- describe_block(blk, board = brd, id = "data")

  expect_match(
    paste(res, collapse = "\n"),
    "Incoming links: (none)",
    fixed = TRUE
  )
})

test_that("describe_block surfaces external-control declaration", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]

  res <- describe_block(blk, board = brd, id = "data")

  expect_match(
    paste(res, collapse = "\n"),
    "Modifiable via modify_block:",
    fixed = TRUE
  )
})

test_that("a class-specific describe_block override is reached", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]
  class(blk) <- c("fake_block_for_test", class(blk))

  registerS3method(
    "describe_block", "fake_block_for_test",
    function(x, board, id, ...) "fake block override line",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_block.fake_block_for_test", envir = globalenv())
    )
  )

  expect_identical(
    describe_block(blk, board = brd, id = "data"),
    "fake block override line"
  )
})

test_that("describe_block renders supplied state over constructor values", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["head"]]

  ctor <- paste(describe_block(blk, board = brd, id = "head"), collapse = "\n")

  live <- paste(
    describe_block(
      blk, board = brd, id = "head",
      state = list(n = 11L, direction = "head")
    ),
    collapse = "\n"
  )

  expect_match(ctor, "Initial block state:", fixed = TRUE)
  expect_no_match(ctor, "int 11", fixed = TRUE)

  expect_match(live, "Block state:", fixed = TRUE)
  expect_match(live, "int 11", fixed = TRUE)
})

test_that("a describe_block override absorbs state through its dots", {

  brd <- make_iris_board()
  blk <- board_blocks(brd)[["data"]]
  class(blk) <- c("fake_block_for_test", class(blk))

  registerS3method(
    "describe_block", "fake_block_for_test",
    function(x, board, id, ...) "fake block override line",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_block.fake_block_for_test", envir = globalenv())
    )
  )

  expect_identical(
    describe_block(
      blk, board = brd, id = "data", state = list(dataset = "mtcars")
    ),
    "fake block override line"
  )
})

test_that("live_block_state evaluates the block's reactive state", {

  board <- reactiveValues(
    blocks = list(
      head = list(
        server = list(state = list(n = reactive(11L), direction = "head"))
      )
    )
  )

  expect_identical(
    live_block_state("head", board),
    list(n = 11L, direction = "head")
  )
})

test_that("live_block_state returns NULL for an unconstructed block", {

  board <- reactiveValues(blocks = list())

  expect_null(live_block_state("head", board))
})
