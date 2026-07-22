fake_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}

call_tool <- function(tool_def, ...) {
  tool_def(...)
}

make_options_board <- function() {
  new_board(
    blocks = c(data = new_dataset_block("iris")),
    options = new_board_options(
      new_board_name_option("My board"),
      new_n_rows_option(50L),
      new_dark_mode_option(),
      new_show_conditions_option()
    )
  )
}

options_session <- function(values) {
  sess <- shiny::MockShinySession$new()
  sess$userData$board_options <- lapply(values, shiny::reactiveVal)
  sess
}

test_that("format_option_value renders scalars, vectors, NULL and functions", {

  expect_identical(format_option_value(50L), "50")
  expect_identical(format_option_value(TRUE), "TRUE")
  expect_identical(format_option_value("dark"), "dark")
  expect_identical(format_option_value(c("warning", "error")), "warning, error")
  expect_identical(format_option_value(NULL), "NULL")

  named <- structure(function() NULL, chat_name = "claude")
  expect_identical(format_option_value(named), "claude")
  expect_identical(format_option_value(function() NULL), "<function>")
})

test_that("parse_option_value decodes JSON and falls back to a bare string", {

  expect_equal(parse_option_value("5"), 5L)
  expect_identical(parse_option_value("true"), TRUE)
  expect_null(parse_option_value("null"))
  expect_identical(parse_option_value("\"My board\""), "My board")
  expect_identical(
    parse_option_value("[\"warning\", \"error\"]"),
    c("warning", "error")
  )
  expect_identical(parse_option_value("Sales"), "Sales")
  expect_error(parse_option_value(""), "no value supplied")
})

test_that("list_board_options returns id/category/value/default rows", {

  board <- reactiveValues(board = make_options_board())

  res <- call_tool(tool_list_board_options(board, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "category", "value", "default"))
  expect_setequal(
    res$id,
    c("board_name", "n_rows", "dark_mode", "show_conditions")
  )

  n_rows <- res[res$id == "n_rows", ]
  expect_identical(n_rows$category, "Table options")
  expect_identical(n_rows$default, "50")
  expect_identical(n_rows$value, "50")

  show <- res[res$id == "show_conditions", ]
  expect_identical(show$value, "warning, error")
})

test_that("list_board_options reflects a live session value over the default", {

  board <- reactiveValues(board = make_options_board())
  sess  <- options_session(list(n_rows = 99L))

  res <- isolate(call_tool(tool_list_board_options(board, sess)))

  n_rows <- res[res$id == "n_rows", ]
  expect_identical(n_rows$value, "99")
  expect_identical(n_rows$default, "50")
})

test_that("list_board_options renders the function-valued llm_model option", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks  = c(data = new_dataset_block("iris")),
    options = new_board_options(new_llm_model_option())
  )
  board <- reactiveValues(board = brd)

  res <- call_tool(tool_list_board_options(board, NULL))

  llm <- res[res$id == "llm_model", ]
  expect_equal(nrow(llm), 1L)
  expect_type(llm$value, "character")
  expect_true(nzchar(llm$value))
})

test_that("list_board_options handles a board with no options", {

  board <- reactiveValues(board = new_board(options = new_board_options()))

  res <- call_tool(tool_list_board_options(board, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "category", "value", "default"))
  expect_equal(nrow(res), 0L)
})

test_that("set_board_option coerces the value to the option's type", {

  board <- reactiveValues(board = make_options_board())
  sess  <- options_session(list(n_rows = 50L))

  res <- call_tool(
    tool_set_board_option(board, sess),
    id = "n_rows", value = "10.0"
  )

  expect_match(res, "Set board option n_rows to 10", fixed = TRUE)
  expect_identical(isolate(get_board_option_value("n_rows", sess)), 10L)
})

test_that("set_board_option accepts a bare-word string value", {

  board <- reactiveValues(board = make_options_board())
  sess  <- options_session(list(board_name = NULL))

  res <- call_tool(
    tool_set_board_option(board, sess),
    id = "board_name", value = "Sales"
  )

  expect_match(res, "Set board option board_name to Sales", fixed = TRUE)
  expect_identical(isolate(get_board_option_value("board_name", sess)), "Sales")
})

test_that("set_board_option refuses the llm_model option", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks  = c(data = new_dataset_block("iris")),
    options = new_board_options(new_llm_model_option())
  )
  board <- reactiveValues(board = brd)

  res <- call_tool(
    tool_set_board_option(board, NULL),
    id = "llm_model", value = "\"x\""
  )

  expect_match(res, "cannot be set here", fixed = TRUE)
})

test_that("set_board_option returns a recovery hint for an unknown id", {

  board <- reactiveValues(board = make_options_board())

  res <- call_tool(
    tool_set_board_option(board, NULL),
    id = "bogus", value = "1"
  )

  expect_match(res, "No board option with id bogus", fixed = TRUE)
})

test_that("register_board_options_tools wires both option tools", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  board  <- reactiveValues(board = make_options_board())
  client <- fake_chat_function()
  before <- length(client$get_tools())

  register_board_options_tools(client, board, NULL)

  expect_equal(length(client$get_tools()) - before, 2L)
})
