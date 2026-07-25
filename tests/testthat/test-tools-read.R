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

test_that("tool_list_stacks returns lean id/name/blocks rows", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_list_stacks(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "name", "blocks"))
  expect_equal(nrow(res), 1L)
  expect_identical(res$blocks, "data, head")
})

test_that("tool_describe_stack surfaces a class-dispatched description", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_describe_stack(board, NULL, NULL), id = "pipeline")

  expect_type(res, "character")
  expect_match(res, "Pipeline", fixed = TRUE)
})

test_that("tool_describe_stack returns a recovery hint for unknown id", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_describe_stack(board, NULL, NULL), id = "bogus")

  expect_match(res, "No stack with id bogus", fixed = TRUE)
})

test_that("tool_describe_stack honours a class override", {

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

  res <- call_tool(tool_describe_stack(board, NULL, NULL), id = "custom")

  expect_identical(res, "OVERRIDE")
})

test_that("tool_list_block_types returns lean selection rows", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_list_block_types(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(
    res, c("id", "name", "package", "category", "description", "inputs")
  )
  expect_false(any(c("guidance", "arguments", "examples") %in% names(res)))
  expect_gt(nrow(res), 0L)
})

test_that("tool_list_block_types caps a long description", {

  long <- strrep("x", description_max_chars() + 500L)

  register_block(
    ctor        = new_head_block,
    name        = "Fixture Long",
    description = long,
    uid         = "fixture_long_desc",
    overwrite   = TRUE
  )
  withr::defer(unregister_blocks("fixture_long_desc"))

  board <- reactiveValues(board = new_board())

  res  <- call_tool(tool_list_block_types(board, NULL, NULL))
  desc <- res$description[res$id == "fixture_long_desc"]

  expect_lt(nchar(desc), nchar(long))
  expect_match(desc, "chars truncated", fixed = TRUE)
  expect_match(desc, "describe_block_type", fixed = TRUE)
})

test_that("tool_describe_block_type surfaces construction metadata", {

  register_block(
    ctor        = new_head_block,
    name        = "Fixture Head",
    description = "Fixture block for metadata tests.",
    uid         = "fixture_meta_block",
    category    = "transform",
    arguments   = new_block_args(
      n = new_block_arg("Rows to keep", example = 3L, type = arg_integer()),
      direction = new_block_arg("Which end", type = arg_enum(c("head", "tail")))
    ),
    guidance    = "Pick n to match the question.",
    examples    = list(list(n = 3L)),
    overwrite   = TRUE
  )
  withr::defer(unregister_blocks("fixture_meta_block"))

  board <- reactiveValues(board = new_board())

  res <- call_tool(
    tool_describe_block_type(board, NULL, NULL), id = "fixture_meta_block"
  )

  expect_identical(res$guidance, "Pick n to match the question.")
  expect_identical(res$examples, list(list(n = 3L)))

  args <- res$arguments
  expect_identical(args$n$description, "Rows to keep")
  expect_identical(args$n$type$type, "integer")
  expect_identical(args$direction$type$type, "string")
  expect_true(all(c("head", "tail") %in% args$direction$type$enum))
})

test_that("tool_describe_block_type returns a recovery hint for unknown id", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_describe_block_type(board, NULL, NULL), id = "bogus")

  expect_match(res, "No registered block type 'bogus'", fixed = TRUE)
})

test_that("tool_list_block_types surfaces block input slots", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_list_block_types(board, NULL, NULL))

  expect_true("inputs" %in% names(res))
  expect_identical(res$inputs[res$id == "head_block"], "data")
  expect_identical(res$inputs[res$id == "merge_block"], "x, y")
  expect_true(is.na(res$inputs[res$id == "dataset_block"]))
  expect_identical(res$inputs[res$id == "rbind_block"], "...")
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

test_that("tool_get_block_conditions returns recovery hint for unknown id", {

  board <- reactiveValues(blocks = list())

  res <- call_tool(tool_get_block_conditions(board, NULL, NULL), id = "bogus")

  expect_match(res, "No block with id bogus", fixed = TRUE)
})

test_that("tool_get_block_conditions notes a block with no cond state", {

  board <- reactiveValues(blocks = list(d = list(server = list())))

  res <- isolate(
    call_tool(tool_get_block_conditions(board, NULL, NULL), id = "d")
  )

  expect_match(res, "no condition state", fixed = TRUE)
})

test_that("tool_get_block_conditions groups captured conditions by severity", {

  cond <- reactiveVal(
    cnd_frame(
      cnd_row("d", "error", "could not find foo"),
      cnd_row("d", "warning", "NAs introduced", phase = "data")
    )
  )
  board <- reactiveValues(
    blocks = list(d = list(server = list(conditions = cond)))
  )

  res <- isolate(
    call_tool(tool_get_block_conditions(board, NULL, NULL), id = "d")
  )

  expect_match(res, "Error (1):", fixed = TRUE)
  expect_match(res, "- [eval] could not find foo", fixed = TRUE)
  expect_match(res, "- [data] NAs introduced", fixed = TRUE)
})

test_that("tool_get_block_conditions reports a healthy block", {

  board <- reactiveValues(
    blocks = list(
      d = list(server = list(conditions = reactiveVal(cnd_frame())))
    )
  )

  res <- isolate(
    call_tool(tool_get_block_conditions(board, NULL, NULL), id = "d")
  )

  expect_match(res, "no active conditions", fixed = TRUE)
})

test_that("register_read_tools wires every read tool onto a chat client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  client <- fake_chat_function()
  before <- length(client$get_tools())

  register_read_tools(client, board, reactiveVal(), NULL)

  expect_equal(length(client$get_tools()) - before, 10L)
})

make_board <- function(results = list()) {

  reactiveValues(
    board  = new_board(),
    blocks = lapply(
      results,
      function(r) {
        list(server = list(result = reactive(r)))
      }
    )
  )
}

call_query <- function(code, results = list()) {
  tool <- tool_query_data(make_board(results), NULL, NULL)
  tool(code = code)
}

test_that("query_data evaluates a single expression against a bound block", {

  res <- isolate(call_query("nrow(data)", list(data = iris)))

  expect_match(res, "150", fixed = TRUE)
})

test_that("query_data auto-prints the last expression value", {

  res <- isolate(
    call_query("length(unique(data$Species))", list(data = iris))
  )

  expect_match(res, "3", fixed = TRUE)
})

test_that("query_data captures stdout from intermediate print calls", {

  res <- isolate(
    call_query("print('hello'); 42", list(data = iris))
  )

  expect_match(res, "hello", fixed = TRUE)
  expect_match(res, "42", fixed = TRUE)
})

test_that("query_data with no arg returns the failed-envelope on parse error", {

  res <- isolate(call_query("nrow(data", list(data = iris)))

  expect_match(res, "^query_data failed:")
})

test_that("query_data returns the failed-envelope on runtime error", {

  res <- isolate(call_query("stop('boom')", list(data = iris)))

  expect_match(res, "^query_data failed:")
  expect_match(res, "boom", fixed = TRUE)
})

test_that("query_data skips blocks whose result errors", {

  bad_results <- list(
    ok  = 1:3
  )
  brd <- reactiveValues(
    board = new_board(),
    blocks = list(
      ok  = list(server = list(result = reactive(1:3))),
      bad = list(
        server = list(
          result = reactive(stop("eval error"))
        )
      )
    )
  )
  tool <- tool_query_data(brd, NULL, NULL)

  res <- isolate(tool(code = "sum(ok)"))

  expect_match(res, "skipped blocks with errors: bad", fixed = TRUE)
  expect_match(res, "6", fixed = TRUE)
})

test_that("query_data truncates output over 200 lines", {

  res <- isolate(call_query("seq_len(5000)", list(data = iris)))

  expect_match(res, "output truncated", fixed = TRUE)
})
