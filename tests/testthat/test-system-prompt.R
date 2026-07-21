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

test_that("summarise_board falls back to header when over the cap", {

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  board <- reactiveValues(board = brd)

  res <- summarise_board(board, max_chars = 5L)

  expect_match(res, "1 block(s)", fixed = TRUE)
  expect_match(res, "(too many entities to inline", fixed = TRUE)
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
