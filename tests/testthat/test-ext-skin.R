skin_tool <- function(name, ...) {
  ellmer::tool(function() NULL, "Description.", name = name, ...)
}

greeting_lines <- function(board) {
  strsplit(isolate(asst_greeting(board))$content, "\n")[[1L]]
}

greeting_chips <- function(board) {
  grep("^- ", greeting_lines(board), value = TRUE)
}

greeting_chip_text <- function(board) {
  sub(
    "^- <span class=\"suggestion\">(.*)</span>$", "\\1",
    greeting_chips(board)
  )
}

populated_board <- function() {

  reactiveValues(
    board = new_board(
      blocks = c(d = new_dataset_block("iris"), h = new_head_block()),
      links  = c(l = new_link("d", "h", "data"))
    )
  )
}

test_that("a tool with no title is titled from its name", {

  expect_identical(
    annotate_tool_title(skin_tool("list_blocks"))@annotations$title,
    "List blocks"
  )
})

test_that("a tool that carries a title keeps it", {

  tool <- skin_tool(
    "add_scatter_block",
    annotations = ellmer::tool_annotations(title = "Draw a scatter plot")
  )

  expect_identical(
    annotate_tool_title(tool)@annotations$title,
    "Draw a scatter plot"
  )
})

test_that("titling a tool twice is a no-op", {

  once <- annotate_tool_title(skin_tool("list_blocks"))

  expect_identical(annotate_tool_title(once), once)
})

test_that("every registered tool is titled and keeps its name", {

  client <- fake_chat_function()

  client$register_tool(skin_tool("list_blocks"))
  client$register_tool(skin_tool("remove_block"))

  annotate_tool_titles(client)

  tools <- client$get_tools()

  expect_named(tools, c("list_blocks", "remove_block"))
  expect_identical(
    chr_ply(tools, function(x) x@annotations$title),
    c("List blocks", "Remove block")
  )
})

test_that("an empty board is asked what to build, and offers a way in", {

  board <- reactiveValues(board = new_board())

  expect_match(greeting_lines(board)[1L], "What do you want to build?")
  expect_identical(
    greeting_chip_text(board),
    c(
      "Load a dataset and show me what is in it",
      "Build a chart from one of the built-in datasets",
      "Set up a filtered table I can explore"
    )
  )
})

test_that("a populated board is asked what to see, and offers no way in", {

  board <- populated_board()

  expect_match(greeting_lines(board)[1L], "What do you want to see?")
  expect_identical(
    greeting_chip_text(board),
    c(
      "Summarize what is on this board",
      "Add a chart of the data on this board",
      "Check this board for problems"
    )
  )
})

# The greeting runs before the board has evaluated, so a block may carry no
# eval status at all. Reading one must not be on the path.
test_that("the greeting does not depend on eval status", {

  bare <- populated_board()
  with_status <- populated_board()
  with_status$eval <- reactiveValues(
    d = reactive("failed"), h = reactive("stale")
  )

  expect_identical(greeting_lines(bare), greeting_lines(with_status))
})

# shinychat only turns a markdown list into clickable suggestions when every
# item holds exactly one `.suggestion` element and nothing else. An item that
# picks up a trailing period or a second tag renders as a plain bullet, with
# no error anywhere -- so the shape is asserted rather than the rendering.
test_that("the greeting keeps shinychat's suggestion-list shape", {

  chips <- greeting_chips(populated_board())

  expect_true(
    all(grepl("^- <span class=\"suggestion\">[^<>]+</span>$", chips))
  )
})
