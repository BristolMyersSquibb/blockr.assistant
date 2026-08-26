skin_tool <- function(name, ...) {
  ellmer::tool(function() NULL, "Description.", name = name, ...)
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

# shinychat only turns a markdown list into clickable suggestions when every
# item holds exactly one `.suggestion` element and nothing else. An item that
# picks up a trailing period or a second tag renders as a plain bullet, with
# no error anywhere -- so the shape is asserted rather than the rendering.
test_that("the greeting keeps shinychat's suggestion-list shape", {

  lines <- strsplit(asst_greeting()$content, "\n")[[1L]]
  items <- grep("^- ", lines, value = TRUE)

  expect_length(items, 3L)
  expect_true(
    all(grepl("^- <span class=\"suggestion\">[^<>]+</span>$", items))
  )
})
