fake_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}

make_iris_board <- function() {
  new_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block()
    ),
    links = c(new_link("data", "head", "data")),
    stacks = c(pipeline = new_stack(c("data", "head"), name = "Pipeline"))
  )
}

call_tool <- function(tool_def, ...) {
  tool_def(...)
}

test_that("with_tool_errors returns the value on success", {

  expect_identical(with_tool_errors("ok", 1L + 1L), 2L)
})

test_that("with_tool_errors traps errors into a formatted string", {

  res <- with_tool_errors("trap", stop("boom"))

  expect_type(res, "character")
  expect_match(res, "trap failed: boom", fixed = TRUE)
})

test_that("tool_list_blocks returns id/type/name/package rows", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  tool <- tool_list_blocks(board, NULL, NULL)
  res <- call_tool(tool)

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "type", "name", "package"))
  expect_setequal(res$id, c("data", "head"))
})

test_that("tool_list_blocks handles an empty board", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_list_blocks(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "type", "name", "package"))
  expect_equal(nrow(res), 0L)
})

test_that("tool_describe_block describes a board block", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_describe_block(board, NULL, NULL), id = "head")

  expect_type(res, "character")
  expect_length(res, 1L)
  expect_match(res, "Incoming links", fixed = TRUE)
})

test_that("tool_describe_block returns a recovery hint for unknown id", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_describe_block(board, NULL, NULL), id = "bogus")

  expect_match(res, "No block with id bogus", fixed = TRUE)
})

test_that("tool_list_links returns the board's link data.frame", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_list_links(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_true(all(c("from", "to", "input") %in% names(res)))
  expect_equal(nrow(res), 1L)
  expect_equal(res$from, "data")
  expect_equal(res$to, "head")
})

test_that("tool_list_stacks surfaces a class-dispatched description", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_list_stacks(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "name", "blocks", "description"))
  expect_equal(nrow(res), 1L)
  expect_match(res$description, "Pipeline", fixed = TRUE)
})

test_that("tool_list_stacks override is honoured in the description column", {

  brd <- new_board(
    blocks = c(data = new_dataset_block("iris")),
    stacks = c(custom = new_stack("data", name = "custom"))
  )

  brd_stacks <- board_stacks(brd)
  class(brd_stacks[["custom"]]) <- c(
    "fake_stack_tool_test", class(brd_stacks[["custom"]])
  )
  board_stacks(brd) <- brd_stacks

  registerS3method(
    "describe_stack", "fake_stack_tool_test",
    function(x, ...) "OVERRIDE",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_stack.fake_stack_tool_test", envir = globalenv())
    )
  )

  board <- reactiveValues(board = brd)

  res <- call_tool(tool_list_stacks(board, NULL, NULL))

  expect_identical(res$description, "OVERRIDE")
})

test_that("tool_list_available_blocks returns registry metadata rows", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_list_available_blocks(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_true(
    all(c("id", "name", "package", "category", "description", "arguments")
        %in% names(res))
  )
  expect_gt(nrow(res), 0L)
})

test_that("tool_get_block_result returns recovery hint for unknown id", {

  board <- reactiveValues(blocks = list())

  res <- call_tool(tool_get_block_result(board, NULL, NULL), id = "bogus")

  expect_match(res, "No block with id bogus", fixed = TRUE)
})

test_that("tool_get_block_result summarises a successful result", {

  fake_result <- reactive({
    head(iris, 5L)
  })

  board <- reactiveValues(
    blocks = list(data = list(server = list(result = fake_result)))
  )

  res <- isolate(
    call_tool(tool_get_block_result(board, NULL, NULL), id = "data")
  )

  expect_type(res, "character")
  expect_length(res, 1L)
})

test_that("register_read_tools wires every read tool onto a chat client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  client <- fake_chat_function()
  before <- length(client$get_tools())

  register_read_tools(client, board, reactiveVal(), NULL)

  expect_equal(length(client$get_tools()) - before, 6L)
})
