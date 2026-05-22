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

test_that("server constructs chat and exposes state matching ctor signature", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = NULL, messages = NULL),
    {
      session$flushReact()

      expect_named(
        session$returned$state,
        c("system_prompt", "messages")
      )
      expect_identical(
        session$returned$state$system_prompt,
        default_system_prompt()
      )
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
    asst_ext_srv(system_prompt = NULL, messages = seed),
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

test_that("server respects a user-supplied system_prompt", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = "be terse", messages = NULL),
    {
      session$flushReact()

      expect_identical(
        session$returned$state$system_prompt,
        "be terse"
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("server registers all six read-only tools on the client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = NULL, messages = NULL),
    {
      session$flushReact()

      tools <- client$get_tools()

      expect_length(tools, 6L)
      expect_setequal(
        names(tools),
        c("list_blocks", "describe_block", "list_links", "list_stacks",
          "list_available_blocks", "get_block_result")
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
    asst_ext_srv(system_prompt = NULL, messages = NULL),
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
    asst_ext_srv(system_prompt = NULL, messages = NULL),
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
    asst_ext_srv(system_prompt = NULL, messages = NULL),
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
