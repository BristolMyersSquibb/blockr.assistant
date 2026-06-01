fake_chat_function <- function(system_prompt = NULL, params = NULL) {
  ellmer::chat_openai(
    model = "gpt-4.1-nano",
    credentials = function() list(Authorization = "Bearer test"),
    echo = "none"
  )
}

with_llm_session <- function() {
  sess <- shiny::MockShinySession$new()
  blockr.core:::board_option_to_userdata(
    new_llm_model_option(),
    session = sess
  )
  sess
}

test_that("default_system_prompt() with no args returns intro only", {

  res <- default_system_prompt()

  expect_type(res, "character")
  expect_length(res, 1L)
  expect_match(res, "You are an assistant embedded next to a blockr")
  expect_match(res, "ids are immutable once committed")
  expect_match(res, "## Layout", fixed = TRUE)
  expect_match(res, "Views are named tabs")
  expect_match(res, "may appear in more than one view")
  expect_no_match(res, "## Tools", fixed = TRUE)
  expect_no_match(res, "## Board", fixed = TRUE)
  expect_no_match(res, "Note: your previous turn's", fixed = TRUE)
})

test_that("default_system_prompt() static document matches the golden", {
  expect_snapshot(cat(default_system_prompt()))
})

test_that("default_system_prompt() golden on a populated board", {

  brd <- new_dock_board(
    blocks = c(
      data = new_dataset_block("iris"),
      head = new_head_block()
    ),
    links = c(ab = new_link("data", "head", "data")),
    layouts = list(
      Analysis = dock_layout("data", "head", active = TRUE),
      Overview = dock_layout("data")
    )
  )

  board   <- reactiveValues(board = brd)
  pending <- reactiveVal(empty_pending())
  client  <- fake_chat_function()

  register_read_tools(client, board, reactiveVal(), NULL)
  register_mutation_tools(client, board, pending, NULL)
  register_view_tools(client, board, pending, NULL)

  flush <- reactiveVal("validator rejected cycle: a -> b -> a")

  prompt <- default_system_prompt(
    board = board,
    client = client,
    last_flush = flush
  )

  expect_snapshot(cat(prompt))
})

test_that("default_system_prompt() with client adds the catalogue", {

  client <- fake_chat_function()
  client$register_tool(
    ellmer::tool(
      function() "ok",
      name = "demo_tool",
      description = "A demo tool description.",
      arguments = list()
    )
  )

  res <- default_system_prompt(client = client)

  expect_match(res, "## Tools", fixed = TRUE)
  expect_match(res, "demo_tool()", fixed = TRUE)
  expect_match(res, "A demo tool description.")
})

test_that("default_system_prompt() with board adds the summary", {

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  board <- reactiveValues(board = brd)

  res <- default_system_prompt(board = board)

  expect_match(res, "## Board", fixed = TRUE)
  expect_match(res, "1 block(s), 0 link(s), 0 stack(s)", fixed = TRUE)
  expect_match(res, "d (dataset_block)", fixed = TRUE)
})

test_that("default_system_prompt() empty board flags the empty case", {

  board <- reactiveValues(board = new_board())

  res <- default_system_prompt(board = board)

  expect_match(res, "(empty board -- no blocks yet)", fixed = TRUE)
})

test_that("default_system_prompt() lists views on a multi-view dock_board", {

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    layouts = list(
      Analysis = dock_layout("a", active = TRUE),
      Overview = dock_layout("a")
    )
  )

  res <- default_system_prompt(board = reactiveValues(board = brd))

  expect_match(res, "2 view(s)", fixed = TRUE)
  expect_match(res, "### Views")
  expect_match(res, "- Analysis (active)", fixed = TRUE)
  expect_match(res, "- Overview", fixed = TRUE)
})

test_that("default_system_prompt() surfaces the flush-rejection note", {

  flush <- reactiveVal("validator rejected cycle")
  res <- default_system_prompt(last_flush = flush)

  expect_match(
    res,
    "Note: your previous turn's changes were rejected: validator",
    fixed = TRUE
  )
})

test_that("default_system_prompt() no note when last_flush is NULL", {

  flush <- reactiveVal(NULL)
  res <- default_system_prompt(last_flush = flush)

  expect_no_match(res, "Note: your previous turn's", fixed = TRUE)
})

test_that("format_tool_catalogue marks optional args with `?`", {

  client <- fake_chat_function()
  client$register_tool(
    ellmer::tool(
      function(x, y) "ok",
      name = "demo",
      description = "demo",
      arguments = list(
        x = ellmer::type_string("required"),
        y = ellmer::type_string("optional", required = FALSE)
      )
    )
  )

  res <- format_tool_catalogue(client)

  expect_match(res, "demo(x, y?)", fixed = TRUE)
})

test_that("format_tool_catalogue handles a client with no tools", {

  client <- fake_chat_function()
  res <- format_tool_catalogue(client)

  expect_identical(res, "(none)")
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
  expect_match(res, "d (dataset_block)", fixed = TRUE)
  expect_match(res, "h (head_block)", fixed = TRUE)
  expect_match(res, "### Links", fixed = TRUE)
  expect_match(res, "l: d -> h$data", fixed = TRUE)
})

test_that("summarise_board falls back to header when over the cap", {

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  board <- reactiveValues(board = brd)

  res <- summarise_board(board, max_chars = 5L)

  expect_match(res, "1 block(s)", fixed = TRUE)
  expect_match(res, "(too many entities to inline", fixed = TRUE)
})

test_that("summarise_block dispatches on block class", {

  registerS3method(
    "summarise_block", "fake_for_dispatch",
    function(x, board, id, ...) "OVERRIDDEN",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("summarise_block.fake_for_dispatch", envir = globalenv())
    )
  )

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  blks <- board_blocks(brd)
  class(blks[["d"]]) <- c("fake_for_dispatch", class(blks[["d"]]))
  board_blocks(brd) <- blks

  board <- reactiveValues(board = brd)
  res <- summarise_board(board)

  expect_match(res, "OVERRIDDEN", fixed = TRUE)
})

test_that("summarise_stack dispatches on stack class", {

  registerS3method(
    "summarise_stack", "fake_stack_for_dispatch",
    function(x, ...) "STACK_OVERRIDDEN",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("summarise_stack.fake_stack_for_dispatch", envir = globalenv())
    )
  )

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris")),
    stacks = c(s = new_stack(blocks = "d", name = "test"))
  )
  stks <- board_stacks(brd)
  class(stks[["s"]]) <- c("fake_stack_for_dispatch", class(stks[["s"]]))
  board_stacks(brd) <- stks

  board <- reactiveValues(board = brd)
  res <- summarise_board(board)

  expect_match(res, "STACK_OVERRIDDEN", fixed = TRUE)
})
