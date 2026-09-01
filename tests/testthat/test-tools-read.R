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

test_that("tool_list_blocks returns id/type/name/package/status rows", {

  brd <- make_iris_board()
  board <- reactiveValues(board = brd)

  tool <- tool_list_blocks(board, NULL, NULL)
  res <- isolate(call_tool(tool))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "type", "name", "package", "status"))
  expect_setequal(res$id, c("data", "head"))
})

test_that("tool_list_blocks reports each block's eval status", {

  board <- reactiveValues(
    board = make_iris_board(),
    eval  = reactiveValues(data = reactive("ready"), head = reactive("stale"))
  )

  res <- isolate(call_tool(tool_list_blocks(board, NULL, NULL)))

  expect_identical(res$status[res$id == "data"], "ready")
  expect_identical(res$status[res$id == "head"], "stale")
})

test_that("tool_list_blocks handles an empty board", {

  board <- reactiveValues(board = new_board())

  res <- call_tool(tool_list_blocks(board, NULL, NULL))

  expect_s3_class(res, "data.frame")
  expect_named(res, c("id", "type", "name", "package", "status"))
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

test_that("tool_describe_block reports the block's eval status", {

  board <- reactiveValues(
    board = make_iris_board(),
    eval  = reactiveValues(head = reactive("stale"))
  )

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_match(res, "Eval status: stale -- ", fixed = TRUE)
  expect_match(res, "out of date", fixed = TRUE)
})

test_that("tool_describe_block omits the status line without one", {

  board <- reactiveValues(board = make_iris_board())

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_no_match(res, "Eval status", fixed = TRUE)
})

test_that("tool_describe_block reports live block state", {

  board <- reactiveValues(
    board  = make_iris_board(),
    blocks = list(
      head = list(
        server = list(state = list(n = reactive(11L), direction = "head"))
      )
    )
  )

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_match(res, "Block state:", fixed = TRUE)
  expect_match(res, "int 11", fixed = TRUE)
})

test_that("tool_describe_block falls back to constructor values", {

  board <- reactiveValues(board = make_iris_board())

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_match(res, "Initial block state:", fixed = TRUE)
  expect_no_match(res, "int 11", fixed = TRUE)
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

test_that("tool_get_block_result explains a dormant block", {

  board <- reactiveValues(
    blocks = list(head = list(server = list(result = reactive(req(FALSE))))),
    eval   = reactiveValues(head = reactive("dormant"))
  )

  res <- isolate(
    call_tool(tool_get_block_result(board, NULL, NULL), id = "head")
  )

  expect_match(
    res, "Block head has no result to read (`dormant`)", fixed = TRUE
  )
  expect_no_match(res, "has not evaluated successfully", fixed = TRUE)
})

test_that("tool_get_block_result flags a stale block's result", {

  board <- reactiveValues(
    blocks = list(head = list(server = list(result = reactive(req(FALSE))))),
    eval   = reactiveValues(head = reactive("stale"))
  )

  res <- isolate(
    call_tool(tool_get_block_result(board, NULL, NULL), id = "head")
  )

  expect_match(res, "(`stale`)", fixed = TRUE)
  expect_match(res, "out of date", fixed = TRUE)
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

test_that("tool_get_block_conditions warns that a stale report is a snapshot", {

  board <- reactiveValues(
    blocks = list(
      d = list(server = list(conditions = reactiveVal(cnd_frame())))
    ),
    eval = reactiveValues(d = reactive("stale"))
  )

  res <- isolate(
    call_tool(tool_get_block_conditions(board, NULL, NULL), id = "d")
  )

  expect_match(res, "as of its last evaluation", fixed = TRUE)
  expect_match(res, "not an all-clear|unknown rather than as an all-clear")
  expect_match(res, "no active conditions", fixed = TRUE)
})

test_that("tool_get_block_conditions leaves a live block's report alone", {

  board <- reactiveValues(
    blocks = list(
      d = list(
        server = list(
          conditions = reactiveVal(cnd_frame(cnd_row("d", "error", "boom")))
        )
      )
    ),
    eval = reactiveValues(d = reactive("failed"))
  )

  res <- isolate(
    call_tool(tool_get_block_conditions(board, NULL, NULL), id = "d")
  )

  expect_no_match(res, "last evaluation", fixed = TRUE)
  expect_match(res, "boom", fixed = TRUE)
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

  expect_equal(length(client$get_tools()) - before, 11L)
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

call_query <- function(code, results = list(), ...) {
  tool <- tool_inspect_results(make_board(results), NULL, NULL)
  tool(code = code, ...)
}

test_that("inspect_results evaluates one expression against a bound block", {

  res <- isolate(call_query("nrow(data)", list(data = iris)))

  expect_match(res, "150", fixed = TRUE)
})

test_that("inspect_results auto-prints the last expression value", {

  res <- isolate(
    call_query("length(unique(data$Species))", list(data = iris))
  )

  expect_match(res, "3", fixed = TRUE)
})

test_that("inspect_results captures stdout from intermediate print calls", {

  res <- isolate(
    call_query("print('hello'); 42", list(data = iris))
  )

  expect_match(res, "hello", fixed = TRUE)
  expect_match(res, "42", fixed = TRUE)
})

test_that("inspect_results returns the failed-envelope on a parse error", {

  res <- isolate(call_query("nrow(data", list(data = iris)))

  expect_match(res, "^inspect_results failed:")
})

test_that("inspect_results returns the failed-envelope on runtime error", {

  res <- isolate(call_query("stop('boom')", list(data = iris)))

  expect_match(res, "^inspect_results failed:")
  expect_match(res, "boom", fixed = TRUE)
})

test_that("inspect_results skips blocks whose result errors", {

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
  tool <- tool_inspect_results(brd, NULL, NULL)

  res <- isolate(tool(code = "sum(ok)"))

  expect_match(res, "Skipped blocks -- no result to bind:", fixed = TRUE)
  expect_match(res, "- bad: no result available", fixed = TRUE)
  expect_match(res, "6", fixed = TRUE)
})

test_that("inspect_results names the eval status of each skipped block", {

  brd <- reactiveValues(
    board = new_board(),
    blocks = list(
      ok   = list(server = list(result = reactive(1:3))),
      off  = list(server = list(result = reactive(req(FALSE)))),
      old  = list(server = list(result = reactive(req(FALSE))))
    ),
    eval = reactiveValues(
      ok = reactive("ready"), off = reactive("dormant"), old = reactive("stale")
    )
  )

  res <- isolate(tool_inspect_results(brd, NULL, NULL)(code = "sum(ok)"))

  expect_match(res, "- off (`dormant`):", fixed = TRUE)
  expect_match(res, "- old (`stale`):", fixed = TRUE)
  expect_match(res, "out of date", fixed = TRUE)
  expect_match(res, "6", fixed = TRUE)
})

test_that("inspect_results truncates output over 200 lines", {

  res <- isolate(call_query("seq_len(5000)", list(data = iris)))

  expect_match(res, "output truncated", fixed = TRUE)
})

test_that("inspect_results returns whatever the code draws as an image", {

  res <- isolate(call_query("plot(1:10)"))

  expect_type(res, "list")
  expect_length(res, 1L)
  expect_s7_class(res[[1L]], ellmer::ContentImageInline)
  expect_identical(res[[1L]]@type, "image/png")
})

test_that("inspect_results captures a non-base engine the same way", {

  # grid.rect() also returns a grob, which auto-prints as text -- so this
  # covers the mixed case too: the text and the drawing both come back.
  res <- isolate(call_query("grid::grid.newpage(); grid::grid.rect()"))

  is_image <- function(x) inherits(x, "ellmer::ContentImageInline")

  expect_true(any(vapply(res, is_image, logical(1L))))
  expect_s7_class(res[[1L]], ellmer::ContentText)
})

test_that("inspect_results draws an auto-printed plot recording", {

  chart <- record_plots("plot(1:10)")

  res <- isolate(call_query("chart[[1]]", list(chart = chart)))

  expect_s7_class(res[[1L]], ellmer::ContentImageInline)
})

test_that("inspect_results returns one image per page drawn", {

  res <- isolate(call_query("plot(1:10); plot(1:5)"))

  expect_length(res, 2L)
})

test_that("inspect_results returns no image when nothing is drawn", {

  res <- isolate(call_query("nrow(data)", list(data = iris)))

  expect_type(res, "character")
  expect_match(res, "150", fixed = TRUE)
})

test_that("inspect_results takes the device size from the model", {

  small <- isolate(call_query("plot(1:10)", width = 240L, height = 240L))
  large <- isolate(call_query("plot(1:10)", width = 900L, height = 900L))

  expect_lt(nchar(small[[1L]]@data), nchar(large[[1L]]@data))
})

test_that("inspect_results clamps a device size out of range", {

  huge <- isolate(call_query("plot(1:10)", width = 99999L, height = 99999L))
  top  <- isolate(call_query("plot(1:10)", width = 2000L, height = 2000L))

  expect_identical(nchar(huge[[1L]]@data), nchar(top[[1L]]@data))
})

test_that("inspect_results keeps the skipped-block report beside an image", {

  brd <- reactiveValues(
    board = new_board(),
    blocks = list(
      ok  = list(server = list(result = reactive(1:3))),
      off = list(server = list(result = reactive(req(FALSE))))
    ),
    eval = reactiveValues(ok = reactive("ready"), off = reactive("dormant"))
  )

  res <- isolate(tool_inspect_results(brd, NULL, NULL)(code = "plot(ok)"))

  expect_length(res, 2L)
  expect_s7_class(res[[1L]], ellmer::ContentText)
  expect_match(res[[1L]]@text, "- off (`dormant`):", fixed = TRUE)
  expect_s7_class(res[[2L]], ellmer::ContentImageInline)
})

test_that("inspect_results caps the images it returns and says it did", {

  withr::local_options(blockr.assistant_plot_render_max = 2L)

  res <- isolate(call_query("plot(1:10); plot(1:5); plot(1:3)"))

  expect_length(res, 3L)
  expect_s7_class(res[[1L]], ellmer::ContentText)
  expect_match(res[[1L]]@text, "Returned 2 of 3 drawn plots", fixed = TRUE)
})

test_that("tool_describe_block names the skills scoped to its type", {

  root <- local_skills_dir()

  write_skill(
    root, "head-rules",
    c("name: head-rules", "description: Keep n small.", "blocks:",
      "  - head_block")
  )

  board <- reactiveValues(board = make_iris_board())
  tool  <- tool_describe_block(board, NULL, NULL)

  res <- call_tool(tool, id = "head")

  expect_match(res, "Skills for this block type", fixed = TRUE)
  expect_match(res, "head-rules: Keep n small.", fixed = TRUE)

  expect_no_match(
    call_tool(tool, id = "data"), "head-rules", fixed = TRUE
  )
})

test_that("tool_describe_block_type names the skills scoped to it", {

  root <- local_skills_dir()

  write_skill(
    root, "head-rules",
    c("name: head-rules", "description: Keep n small.", "blocks:",
      "  - head_block")
  )

  board <- reactiveValues(board = new_board())
  tool  <- tool_describe_block_type(board, NULL, NULL)

  expect_identical(
    call_tool(tool, id = "head_block")$skills,
    list(list(name = "head-rules", description = "Keep n small."))
  )
  expect_null(call_tool(tool, id = "dataset_block")$skills)
})

test_that("an unscoped skill stays out of the per-block responses", {

  root <- local_skills_dir()

  write_skill(root, "global", c("name: global", "description: Everywhere."))

  board <- reactiveValues(board = make_iris_board())

  expect_no_match(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head"),
    "global",
    fixed = TRUE
  )
  expect_null(
    call_tool(
      tool_describe_block_type(board, NULL, NULL), id = "head_block"
    )$skills
  )
})

test_that("tool_describe_block omits a state value str() would cut", {

  long  <- strrep("z", 300L)
  board <- reactiveValues(
    board  = make_iris_board(),
    blocks = list(
      head = list(
        server = list(
          state = list(n = reactive(11L), direction = reactive(long))
        )
      )
    )
  )

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_match(res, "300 chars omitted", fixed = TRUE)
  expect_match(res, "get_block_state", fixed = TRUE)
  expect_no_match(res, "zzz", fixed = TRUE)
  expect_no_match(res, "__truncated__", fixed = TRUE)
})

test_that("tool_describe_block points a cut summary at get_block_state", {

  withr::local_options(blockr.assistant_summary_max_chars = 200L)

  board <- reactiveValues(board = make_iris_board())

  res <- isolate(
    call_tool(tool_describe_block(board, NULL, NULL), id = "head")
  )

  expect_match(res, "get_block_state", fixed = TRUE)
})

test_that("tool_get_block_state returns live values in full", {

  script <- strrep("x <- 1; ", 400L)
  board  <- reactiveValues(
    board  = make_iris_board(),
    blocks = list(
      head = list(
        server = list(
          state = list(n = reactive(11L), direction = reactive(script))
        )
      )
    )
  )

  res <- isolate(
    call_tool(tool_get_block_state(board, NULL, NULL), id = "head")
  )

  expect_identical(res$id, "head")
  expect_identical(res$values$direction, script)
  expect_identical(res$values$n, 11L)
})

test_that("tool_get_block_state bounds what it returns", {

  withr::local_options(blockr.assistant_state_max_chars = 200L)

  board <- reactiveValues(
    board  = make_iris_board(),
    blocks = list(
      head = list(
        server = list(state = list(direction = reactive(strrep("z", 5000L))))
      )
    )
  )

  res <- isolate(
    call_tool(tool_get_block_state(board, NULL, NULL), id = "head")
  )

  expect_lte(nchar(res$values$direction), 200L)
  expect_match(res$values$direction, "truncated", fixed = TRUE)
})

test_that("tool_get_block_state reports a block holding no live state", {

  board <- reactiveValues(board = make_iris_board())

  res <- isolate(
    call_tool(tool_get_block_state(board, NULL, NULL), id = "head")
  )

  expect_match(res, "no live state", fixed = TRUE)
  expect_match(res, "describe_block", fixed = TRUE)
})

test_that("tool_get_block_state returns a recovery hint for unknown id", {

  board <- reactiveValues(board = make_iris_board())

  res <- call_tool(tool_get_block_state(board, NULL, NULL), id = "bogus")

  expect_match(res, "No block with id bogus", fixed = TRUE)
})

test_that("inspect_results reaches the graphics package to draw with", {

  # eval_env() parents on baseenv() unless the board opts in, which leaves
  # hist() and friends out of scope -- the tool attaches them regardless.
  res <- isolate(call_query("hist(data$Sepal.Length)", list(data = iris)))

  is_image <- function(x) inherits(x, "ellmer::ContentImageInline")

  expect_true(any(vapply(res, is_image, logical(1L))))
})

test_that("inspect_results leaves the board's own eval scope untouched", {

  before <- getOption("blockr.attach_default_packages")

  isolate(call_query("nrow(data)", list(data = iris)))

  expect_identical(getOption("blockr.attach_default_packages"), before)
})
