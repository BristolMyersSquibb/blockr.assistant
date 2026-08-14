call_tool <- function(tool_def, ...) {
  tool_def(...)
}

typed_board <- function() {
  reactiveValues(
    board = new_board(blocks = c(d = new_dataset_block("iris")))
  )
}

typed_pool <- function(client, board = typed_board()) {
  new_block_tool_pool(client, board, reactiveVal(empty_pending()), NULL)
}

test_that("a fully typed block type yields one tool argument per ctor arg", {

  props <- add_tool_types("head_block")

  expect_named(props, c("n", "direction", "block_name", "id"))
  expect_false(props[["n"]]@required)
  expect_identical(props[["n"]]@json[["type"]], "integer")
})

test_that("an argument's registry description reaches the tool schema", {

  props <- add_tool_types("head_block")

  expect_identical(
    props[["n"]]@json[["description"]],
    arg_spec_description(block_meta_arguments("head_block")[["n"]])
  )
})

test_that("a description on the type descriptor is not overwritten", {

  args <- new_arg_specs(
    x = new_arg_spec("Outer.", type = arg_string("Inner."))
  )

  expect_identical(arg_tool_types(args)[["x"]]@json[["description"]], "Inner.")
})

test_that("a declared enum reaches the tool schema as an enum", {

  props <- add_tool_types("head_block")

  expect_identical(
    unlist(props[["direction"]]@json[["enum"]]), c("head", "tail")
  )
})

test_that("a declared array reaches the tool schema as an array", {

  props <- add_tool_types("merge_block")

  expect_identical(props[["by"]]@json[["type"]], "array")
  expect_identical(props[["by"]]@json[["items"]][["type"]], "string")
})

test_that("an argument with no declared type disqualifies the whole type", {

  args <- new_arg_specs(
    typed = new_arg_spec("Typed.", type = arg_string()),
    free  = new_arg_spec("Untyped.")
  )

  expect_null(arg_tool_types(args))
  expect_length(arg_tool_types(args["typed"]), 1L)
})

test_that("modify tool arguments cover only the controllable subset", {

  props <- modify_tool_types("dataset_block")

  expect_named(props, c("id", "dataset", "block_name"))
  expect_true(props[["id"]]@required)

  expect_null(modify_tool_types("head_block"))
})

test_that("the built tool's schema and formals agree", {

  tool <- block_tool(
    "add", "head_block", typed_board(), reactiveVal(empty_pending()), NULL,
    function(...) invisible()
  )

  expect_named(
    tool@arguments@properties, c("n", "direction", "block_name", "id")
  )
  expect_match(tool@name, "add_head_block")
})

test_that("a typed add tool stages the block it names", {

  pending <- reactiveVal(empty_pending())
  board <- typed_board()

  tool <- block_tool(
    "add", "head_block", board, pending, NULL, function(...) invisible()
  )

  expect_match(
    call_tool(tool, n = 4L, id = "h1"), "Staged add_block(h1)", fixed = TRUE
  )

  staged <- isolate(pending())$blocks$add

  expect_named(staged, "h1")
  expect_s3_class(staged[["h1"]], "head_block")
})

test_that("a typed add tool generates an id when none is given", {

  pending <- reactiveVal(empty_pending())

  tool <- block_tool(
    "add", "head_block", typed_board(), pending, NULL,
    function(...) invisible()
  )

  call_tool(tool, n = 2L)

  expect_length(isolate(pending())$blocks$add, 1L)
})

test_that("a typed modify tool stages the delta it is given", {

  pending <- reactiveVal(empty_pending())

  tool <- block_tool(
    "modify", "dataset_block", typed_board(), pending, NULL,
    function(...) invisible()
  )

  expect_match(
    call_tool(tool, id = "d", dataset = "mtcars"),
    "Staged modify_block(d)",
    fixed = TRUE
  )
  expect_identical(isolate(pending())$blocks$mod$d$dataset, "mtcars")
})

test_that("a typed modify tool refuses an empty delta", {

  tool <- block_tool(
    "modify", "dataset_block", typed_board(), reactiveVal(empty_pending()),
    NULL, function(...) invisible()
  )

  expect_match(call_tool(tool, id = "d"), "no fields supplied")
})

test_that("arming reports why a type has no typed tool", {

  pool <- typed_pool(fake_chat_function())

  expect_match(pool$arm("modify", "head_block"), "no externally controllable")
  expect_match(untyped_note("add", "head_block"), "not every argument declares")
})

test_that("re-arming an armed type leaves the manifest untouched", {

  client <- fake_chat_function()
  pool <- typed_pool(client)

  pool$arm("add", "head_block")
  before <- names(client$get_tools())

  expect_match(pool$arm("add", "head_block"), "add_head_block")
  expect_identical(names(client$get_tools()), before)
  expect_identical(pool$armed(), "add:head_block")
})

test_that("the pool evicts least recently used across turns", {

  withr::local_options(blockr.assistant_block_tool_pool = 2L)

  client <- fake_chat_function()
  pool <- typed_pool(client)

  pool$arm("add", "head_block")
  pool$arm("add", "dataset_block")
  pool$new_turn()
  pool$arm("add", "merge_block")

  expect_identical(pool$armed(), c("add:dataset_block", "add:merge_block"))
  expect_false("add_head_block" %in% names(client$get_tools()))
  expect_true("add_merge_block" %in% names(client$get_tools()))
})

test_that("using a tool protects it from the next eviction", {

  withr::local_options(blockr.assistant_block_tool_pool = 2L)

  pool <- typed_pool(fake_chat_function())

  pool$arm("add", "head_block")
  pool$arm("add", "dataset_block")
  pool$new_turn()
  pool$note("add", "head_block")
  pool$arm("add", "merge_block")

  expect_identical(pool$armed(), c("add:head_block", "add:merge_block"))
})

test_that("the pool refuses rather than evicting a tool armed this turn", {

  withr::local_options(blockr.assistant_block_tool_pool = 2L)

  pool <- typed_pool(fake_chat_function())

  pool$arm("add", "head_block")
  pool$arm("add", "dataset_block")

  res <- pool$arm("add", "merge_block")

  expect_match(res, "pool is full")
  expect_match(res, "head_block, dataset_block")
  expect_length(pool$armed(), 2L)
})

test_that("the two kinds are capped and evicted independently", {

  withr::local_options(blockr.assistant_block_tool_pool = 1L)

  pool <- typed_pool(fake_chat_function())

  pool$arm("add", "head_block")
  pool$arm("modify", "dataset_block")

  expect_identical(pool$armed(), c("add:head_block", "modify:dataset_block"))

  pool$new_turn()
  pool$arm("add", "merge_block")

  expect_identical(pool$armed(), c("modify:dataset_block", "add:merge_block"))
})

test_that("describe_block_type arms the add tool and says so", {

  client <- fake_chat_function()
  board <- typed_board()
  pool <- typed_pool(client, board)

  res <- call_tool(
    tool_describe_block_type(board, NULL, NULL, pool), id = "head_block"
  )

  expect_match(res$typed_tool, "add_head_block")
  expect_identical(pool$armed(), "add:head_block")
  expect_true("add_head_block" %in% names(client$get_tools()))
})

test_that("describe_block arms the modify tool for the block's type", {

  client <- fake_chat_function()
  board <- typed_board()
  pool <- typed_pool(client, board)

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL, pool), id = "d")
  )

  expect_match(res, "modify_dataset_block", fixed = TRUE)
  expect_identical(pool$armed(), "modify:dataset_block")
})

test_that("the describe tools work without a pool", {

  board <- typed_board()

  expect_null(
    call_tool(
      tool_describe_block_type(board, NULL, NULL), id = "head_block"
    )$typed_tool
  )

  expect_no_match(
    isolate(call_tool(tool_describe_block(board, NULL, NULL), id = "d")),
    "typed",
    fixed = TRUE
  )
})
