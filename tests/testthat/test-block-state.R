# A block object carries the values it was constructed with; the values a user
# is actually looking at live in the block server. These cover the gap.

test_that("describe_block reports what the user changed, not the ctor value", {

  brd <- new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block(n = 6L)
    ),
    links = c(new_link("data", "head", "data"))
  )

  shiny::testServer(
    blockr.core:::get_s3_method("board_server", brd),
    {
      session$flushReact()

      # The user turns the gear down to 2 rows.
      session$setInputs(`block_head-expr-n` = 2L)
      session$flushReact()

      out <- paste(
        describe_block(
          board_blocks(rv$board)[["head"]],
          board = rv$board,
          id    = "head",
          state = block_current_state(rv, "head")
        ),
        collapse = "\n"
      )

      expect_match(out, "Current block state:", fixed = TRUE)
      expect_match(out, "n: int 2", fixed = TRUE)
      expect_false(grepl("Initial block state:", out, fixed = TRUE))
    },
    args = list(x = brd)
  )
})

test_that("the describe_block tool passes the live state through", {

  brd <- new_board(blocks = c(data = new_dataset_block("iris")))

  shiny::testServer(
    blockr.core:::get_s3_method("board_server", brd),
    {
      session$flushReact()

      tool <- tool_describe_block(rv, board_update, session)

      expect_match(tool("data"), 'dataset: chr "iris"', fixed = TRUE)

      # `dataset` is external_ctrl, so this is the assistant's own edit path.
      board_update(
        list(blocks = list(mod = list(data = list(dataset = "mtcars"))))
      )
      session$flushReact()

      expect_match(tool("data"), 'dataset: chr "mtcars"', fixed = TRUE)
    },
    args = list(x = brd)
  )
})

test_that("block_current_state is NULL for a block that was never built", {

  board <- shiny::reactiveValues(blocks = list())

  expect_null(block_current_state(board, "nope"))

  board$blocks <- list(a = list(server = list(state = list())))

  expect_null(block_current_state(board, "a"))
})

test_that("a multi-line value is rendered whole, not str()-truncated", {

  script <- paste(
    "# only the four-cylinder cars, best mileage first",
    "d <- subset(data, cyl == 4)",
    'd[order(-d$mpg), c("mpg", "cyl", "hp")]',
    sep = "\n"
  )

  out <- paste(
    format_block_state(list(script = script, values = list())),
    collapse = "\n"
  )

  # Every line of the script survives. str() would have cut it at ~70 chars
  # and appended "| __truncated__", which is what made a model rewrite a code
  # block from scratch instead of editing it.
  for (ln in strsplit(script, "\n", fixed = TRUE)[[1]]) {
    expect_match(out, ln, fixed = TRUE)
  }

  expect_false(grepl("__truncated__", out, fixed = TRUE))
})

test_that("splice_block_state leaves a description with no state section", {

  lines <- c("<some_block>", "Stateless block", "Constructor: pkg::ctor()")

  expect_identical(splice_block_state(lines, list(a = 1)), lines)
})
