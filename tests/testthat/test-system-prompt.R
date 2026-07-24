test_that("default_system_prompt() with no args returns intro only", {

  res <- default_system_prompt()

  expect_type(res, "character")
  expect_length(res, 1L)
  expect_match(res, "You are an assistant embedded next to a blockr")
  expect_match(res, "ids are immutable once committed")
  expect_match(res, "## Layout", fixed = TRUE)
  expect_match(res, "Views are tabs")
  expect_match(res, "the board assigns the id", fixed = TRUE)
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
    views = list(
      Analysis = c("data", "head"),
      Overview = "data"
    )
  )

  board   <- reactiveValues(board = brd)
  pending <- reactiveVal(empty_pending())
  client  <- fake_chat_function()

  register_read_tools(client, board, reactiveVal(), NULL)
  register_mutation_tools(client, board, pending, NULL)
  register_view_tools(client, board, pending, NULL, NULL)
  register_commit_tool(client, function() invisible())

  prompt <- default_system_prompt(board = board, client = client)

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
  expect_match(res, "d <dataset_block>", fixed = TRUE)
})

test_that("default_system_prompt() empty board flags the empty case", {

  board <- reactiveValues(board = new_board())

  res <- default_system_prompt(board = board)

  expect_match(res, "(empty board -- no blocks yet)", fixed = TRUE)
})

test_that("default_system_prompt() lists views on a multi-view dock_board", {

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    views = list(
      v_main = dock_view("a", name = "Analysis"),
      v_over = dock_view("a", name = "Overview")
    )
  )

  res <- default_system_prompt(board = reactiveValues(board = brd))

  expect_match(res, "1 block(s), 0 link(s), 0 stack(s)", fixed = TRUE)
  expect_match(res, "### Views")
  expect_match(res, "- Analysis (id: v_main) (active)", fixed = TRUE)
  expect_match(res, "- Overview (id: v_over)", fixed = TRUE)
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
