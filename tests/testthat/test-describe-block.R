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
