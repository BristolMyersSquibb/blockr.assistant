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

test_that("new_assistant_extension produces a valid dock_extension", {

  ext <- new_assistant_extension()

  expect_true(blockr.dock::is_dock_extension(ext))
  expect_s3_class(ext, "assistant_extension")
  expect_identical(blockr.dock::extension_name(ext), "Assistant")
})

test_that("new_assistant_extension brings along the llm_model option", {

  ext <- new_assistant_extension()
  opts <- blockr.core::board_options(ext)

  expect_true("llm_model" %in% names(opts))
})

test_that("new_assistant_extension validates", {

  expect_silent(
    blockr.dock::validate_extension(new_assistant_extension())
  )
})

test_that("default_system_prompt returns a non-empty string", {

  res <- default_system_prompt()

  expect_type(res, "character")
  expect_length(res, 1L)
  expect_gt(nchar(res), 0L)
})

test_that("format_token_telemetry handles missing / NA / real tokens", {

  expect_null(format_token_telemetry(NULL))

  na_turn <- ellmer::Turn("assistant", "hi")
  expect_null(format_token_telemetry(na_turn))

  real_turn <- ellmer::Turn("assistant", "hi")
  real_turn@tokens <- c(312, 84, NA)

  res <- format_token_telemetry(real_turn)
  expect_s3_class(res, "shiny.tag")

  html <- as.character(res)
  expect_match(html, "asst-meta", fixed = TRUE)
  expect_match(html, ">312<")
  expect_match(html, ">84<")
})

test_that("function-arg system_prompt is omitted from state", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      expect_named(session$returned$state, "messages")
      expect_length(session$returned$state$messages(), 0L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("server seeds the chat from a saved messages argument", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  seed <- lapply(
    list(
      ellmer::Turn("user", "load iris"),
      ellmer::Turn("assistant", "loaded")
    ),
    ellmer::contents_record
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = seed),
    {
      session$flushReact()

      expect_length(session$returned$state$messages(), 2L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("string system_prompt is used verbatim and stored in state", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = "be terse", messages = NULL),
    {
      session$flushReact()

      expect_identical(
        session$returned$state$system_prompt,
        "be terse"
      )
      expect_identical(client$get_system_prompt(), "be terse")
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("server registers the read and mutation tools on the client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client$get_tools()

      expect_length(tools, 16L)
      expect_setequal(
        names(tools),
        c(
          "list_blocks", "describe_block", "list_links", "list_stacks",
          "list_available_blocks", "get_block_result", "query_data",
          "add_block", "remove_block", "modify_block",
          "add_link", "remove_link", "modify_link",
          "add_stack", "remove_stack", "modify_stack"
        )
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("registered list_blocks tool reflects the live board contents", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris"), h = new_head_block()),
    links = c(new_link("d", "h", "data"))
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      res <- client$get_tools()$list_blocks()

      expect_s3_class(res, "data.frame")
      expect_setequal(res$id, c("d", "h"))
      expect_true("dataset_block" %in% res$type)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("registered describe_block tool dispatches on block class", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  registerS3method(
    "describe_block", "fake_block_in_server_test",
    function(x, board, id, ...) "marked by override",
    envir = globalenv()
  )
  withr::defer(
    suppressWarnings(
      rm("describe_block.fake_block_in_server_test", envir = globalenv())
    )
  )

  blks <- board_blocks(brd)
  class(blks[["d"]]) <- c("fake_block_in_server_test", class(blks[["d"]]))
  board_blocks(brd) <- blks

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      res <- client$get_tools()$describe_block(id = "d")

      expect_identical(res, "marked by override")
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("registered tool surfaces an error string instead of crashing", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      res <- client$get_tools()$describe_block(id = "no-such-block")

      expect_match(res, "No block with id no-such-block", fixed = TRUE)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("pending_update is initialised empty and survives a no-op flush", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  calls <- 0L
  fake_update <- function(payload) calls <<- calls + 1L

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      expect_false(isolate(has_any_changes(pending_update())))

      flush_pending(pending_update, update)

      expect_identical(calls, 0L)
      expect_false(isolate(has_any_changes(pending_update())))
    },
    args = list(
      board = reactiveValues(board = brd),
      update = fake_update
    ),
    session = with_llm_session()
  )
})

test_that("staging across a turn flushes once and resets pending", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(
    blocks = c(d = new_dataset_block("iris"), h = new_head_block())
  )

  captured <- list()
  calls <- 0L
  fake_update <- function(payload) {
    calls <<- calls + 1L
    captured[[length(captured) + 1L]] <<- payload
  }

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "new1", new_head_block())
      stage_block_add(pending_update, board, "new2", new_head_block())
      stage_block_rm(pending_update, board, "h")

      expect_true(isolate(has_any_changes(pending_update())))

      flush_pending(pending_update, update)

      expect_identical(calls, 1L)
      expect_setequal(names(captured[[1]]$blocks$add), c("new1", "new2"))
      expect_equal(captured[[1]]$blocks$rm, "h")
      expect_false(isolate(has_any_changes(pending_update())))

      flush_pending(pending_update, update)
      expect_identical(calls, 1L)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = fake_update
    ),
    session = with_llm_session()
  )
})

test_that("reset_pending wipes a non-empty pending payload", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "new", new_head_block())
      expect_true(isolate(has_any_changes(pending_update())))

      reset_pending(pending_update)
      expect_false(isolate(has_any_changes(pending_update())))
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("recovery sequence flushes a single corrected add", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  captured <- list()
  fake_update <- function(payload) {
    captured[[length(captured) + 1L]] <<- payload
  }

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client$get_tools()

      expect_match(
        tools$add_block(type = "head_block", args = "{}", id = "x"),
        "^Staged add_block"
      )
      expect_match(
        tools$modify_block(id = "x", args = "{\"n\": 10}"),
        "staged for creation"
      )
      expect_match(
        tools$remove_block(id = "x"),
        "^Staged remove_block"
      )
      expect_match(
        tools$add_block(type = "head_block", args = "{}", id = "x"),
        "^Staged add_block"
      )

      flush_pending(pending_update, update)

      expect_length(captured, 1L)
      expect_named(captured[[1]]$blocks$add, "x")
      expect_length(captured[[1]]$blocks$rm, 0L)
      expect_length(captured[[1]]$blocks$mod, 0L)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = fake_update
    ),
    session = with_llm_session()
  )
})

test_that("demo app file constructs a shiny.appobj without crashing", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "01-shell", "app.R",
                     package = "blockr.assistant")

  if (!nzchar(src)) {
    skip("Demo app not found in installed package")
  }

  env <- new.env()
  app <- source(src, local = env)$value

  expect_s3_class(app, "shiny.appobj")
})

test_that("02-read-tools demo app file constructs a shiny.appobj", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "02-read-tools", "app.R",
                     package = "blockr.assistant")

  if (!nzchar(src)) {
    skip("Demo app not found in installed package")
  }

  env <- new.env()
  app <- source(src, local = env)$value

  expect_s3_class(app, "shiny.appobj")
})

test_that("04-mutation-tools demo app file constructs a shiny.appobj", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "04-mutation-tools", "app.R",
                     package = "blockr.assistant")

  if (!nzchar(src)) {
    skip("Demo app not found in installed package")
  }

  env <- new.env()
  app <- source(src, local = env)$value

  expect_s3_class(app, "shiny.appobj")
})

test_that("05-polish demo app file constructs a shiny.appobj", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "05-polish", "app.R",
                     package = "blockr.assistant")

  if (!nzchar(src)) {
    skip("Demo app not found in installed package")
  }

  env <- new.env()
  app <- source(src, local = env)$value

  expect_s3_class(app, "shiny.appobj")
})

test_that("initial refresh sets the composed prompt on the client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      prompt <- client$get_system_prompt()
      expect_match(prompt, "## Tools", fixed = TRUE)
      expect_match(prompt, "## Board", fixed = TRUE)
      expect_match(prompt, "d (dataset_block)", fixed = TRUE)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("static string system_prompt is used verbatim each refresh", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = "STATIC", messages = NULL),
    {
      session$flushReact()

      expect_identical(client$get_system_prompt(), "STATIC")

      # mutate board to trigger the refresh observer
      board$board <- new_board(blocks = c(x = new_dataset_block("iris")))
      session$flushReact()

      expect_identical(client$get_system_prompt(), "STATIC")
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("board$board change triggers a fresh prompt", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      before <- client$get_system_prompt()
      expect_match(before, "0 block(s)", fixed = TRUE)

      board$board <- new_board(blocks = c(x = new_dataset_block("iris")))
      session$flushReact()

      after <- client$get_system_prompt()
      expect_match(after, "1 block(s)", fixed = TRUE)
      expect_match(after, "x (dataset_block)", fixed = TRUE)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a throwing system_prompt function keeps the prior prompt", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  # Function that succeeds once (initial mount), then throws.
  call_count <- 0L
  flaky_prompt <- function(board, client, last_flush, ...) {
    call_count <<- call_count + 1L
    if (call_count == 1L) {
      "FIRST"
    } else {
      stop("composer-boom")
    }
  }

  testServer(
    asst_ext_srv(system_prompt = flaky_prompt, messages = NULL),
    {
      session$flushReact()

      expect_identical(client$get_system_prompt(), "FIRST")

      board$board <- new_board(
        blocks = c(x = new_dataset_block("iris"))
      )
      session$flushReact()

      # composer threw -> prompt unchanged
      expect_identical(client$get_system_prompt(), "FIRST")
      # composer was actually re-invoked on the change
      expect_gte(call_count, 2L)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("flush rejection populates last_flush_error and the delta note", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  rejecting_update <- function(payload) {
    stop("validator rejected this payload")
  }

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(
        pending_update, board, "new", new_head_block()
      )

      expect_warning(
        flush_pending(pending_update, update, last_flush_error),
        "validator rejected this payload"
      )
      session$flushReact()

      expect_identical(
        isolate(last_flush_error()),
        "validator rejected this payload"
      )

      prompt <- client$get_system_prompt()
      expect_match(
        prompt,
        "Note: your previous turn's changes were rejected",
        fixed = TRUE
      )
    },
    args = list(
      board = reactiveValues(
        board = new_board(blocks = c(d = new_dataset_block("iris")))
      ),
      update = rejecting_update
    ),
    session = with_llm_session()
  )
})

test_that("a successful follow-up flush clears the delta note", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  succeeding_update <- function(payload) invisible(payload)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      last_flush_error("prior rejection")
      session$flushReact()
      expect_match(
        client$get_system_prompt(),
        "Note: your previous turn's", fixed = TRUE
      )

      # No staged changes -> no-op flush -> error clears
      flush_pending(pending_update, update, last_flush_error)
      session$flushReact()

      expect_null(isolate(last_flush_error()))
      expect_no_match(
        client$get_system_prompt(),
        "Note: your previous turn's", fixed = TRUE
      )
    },
    args = list(
      board = reactiveValues(
        board = new_board(blocks = c(d = new_dataset_block("iris")))
      ),
      update = succeeding_update
    ),
    session = with_llm_session()
  )
})
