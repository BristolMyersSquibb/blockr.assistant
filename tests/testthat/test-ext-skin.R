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

linked_board <- function(...) {

  reactiveValues(
    board = new_board(
      blocks = c(d = new_dataset_block("iris"), h = new_head_block()),
      links  = c(l = new_link("d", "h", "data"))
    ),
    eval = reactiveValues(...)
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
      "Show me which block types are available",
      "Load a dataset to start from"
    )
  )
})

test_that("a healthy board is asked what to see, and offers no repairs", {

  board <- linked_board(d = reactive("ready"), h = reactive("ready"))

  expect_match(greeting_lines(board)[1L], "What do you want to see?")
  expect_length(greeting_chips(board), 3L)
  expect_no_match(greeting_chip_text(board), "Look into", fixed = TRUE)
  expect_true(
    "Explain how these blocks fit together" %in% greeting_chip_text(board)
  )
})

test_that("a faulted block is surfaced and offered as something to look into", {

  board <- linked_board(d = reactive("ready"), h = reactive("failed"))

  expect_match(greeting_lines(board)[1L], "not producing results")
  expect_true(
    "Look into the block that has no result" %in% greeting_chip_text(board)
  )
})

test_that("several faulted blocks are counted", {

  board <- linked_board(d = reactive("unset"), h = reactive("waiting"))

  expect_true(
    "Look into the 2 blocks that have no result" %in% greeting_chip_text(board)
  )
})

# A block the board has parked off screen holds no result either, but that is
# the deferral working rather than a fault, so it must not read as one.
test_that("a deferred block is not offered as something to look into", {

  for (status in c("dormant", "stale")) {

    board <- linked_board(d = reactive("ready"), h = reactive(status))

    expect_match(greeting_lines(board)[1L], "What do you want to see?")
    expect_no_match(greeting_chip_text(board), "Look into", fixed = TRUE)
  }
})

test_that("charting is not offered when no block holds a result", {

  board <- reactiveValues(
    board = new_board(blocks = c(h = new_head_block())),
    eval  = reactiveValues(h = reactive("unset"))
  )

  expect_no_match(greeting_chip_text(board), "Chart the data", fixed = TRUE)
  expect_true(
    "Summarize what is on this board" %in% greeting_chip_text(board)
  )
})

# shinychat only turns a markdown list into clickable suggestions when every
# item holds exactly one `.suggestion` element and nothing else. An item that
# picks up a trailing period or a second tag renders as a plain bullet, with
# no error anywhere -- so the shape is asserted rather than the rendering.
test_that("the greeting keeps shinychat's suggestion-list shape", {

  chips <- greeting_chips(
    linked_board(d = reactive("ready"), h = reactive("failed"))
  )

  expect_true(
    all(grepl("^- <span class=\"suggestion\">[^<>]+</span>$", chips))
  )
})
