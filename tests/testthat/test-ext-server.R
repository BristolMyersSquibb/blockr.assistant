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

test_that("function-arg system_prompt leaves state empty", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      expect_length(session$returned$state, 0L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("the conversation stays out of state", {

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

      expect_length(client_r()$get_turns(), 2L)
      expect_false("messages" %in% names(session$returned$state))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("deser drops a legacy messages payload", {

  ser <- blockr.core::blockr_ser(
    new_assistant_extension(),
    data = list(
      messages = lapply(
        list(ellmer::Turn("user", "hi"), ellmer::Turn("assistant", "hello")),
        ellmer::contents_record
      )
    )
  )

  json <- jsonlite::fromJSON(
    jsonlite::toJSON(ser, null = "null"),
    simplifyDataFrame = FALSE,
    simplifyMatrix = FALSE
  )

  ext <- blockr.core::blockr_deser(json)

  expect_s3_class(ext, "assistant_extension")

  # Left in place, the legacy records reach contents_replay() in a board
  # server observer and abort the whole board on mount.
  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    blockr.dock::extension_server(ext),
    {
      session$flushReact()

      expect_length(client_r()$get_turns(), 0L)
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
      expect_identical(client_r()$get_system_prompt(), "be terse")
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

      tools <- client_r()$get_tools()

      expect_length(tools, 34L)
      expect_setequal(
        names(tools),
        c(
          "list_blocks", "describe_block", "list_links",
          "list_stacks", "describe_stack",
          "list_block_types", "describe_block_type",
          "get_block_result",
          "get_block_conditions", "query_data",
          "add_block", "remove_block", "modify_block",
          "add_link", "remove_link", "modify_link",
          "add_stack", "remove_stack", "modify_stack",
          "commit", "discard",
          "list_views", "validate_layout",
          "add_view", "remove_view",
          "add_panel_to_view", "remove_panel_from_view", "move_panel",
          "resize_panel", "focus_panel", "set_active_view", "rename_view",
          "list_board_options", "set_board_option"
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

test_that("a dock board additionally registers the extension tools", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    views  = list(Main = "a")
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()

      expect_length(tools, 37L)
      expect_true(
        all(
          c("list_extensions", "describe_extension", "modify_extension") %in%
            names(tools)
        )
      )
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("server threads view_data into the prompt and the view tools", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_dock_board(
    blocks = c(a = new_dataset_block("iris")),
    views  = list(
      v_main = dock_view("a", name = "Analysis"),
      v_over = dock_view("a", name = "Overview")
    )
  )

  live_views <- board_views(brd)
  active_view(live_views) <- "v_over"
  vd <- reactiveVal(list(views = live_views, grids = board_grids(brd)))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      expect_match(
        client_r()$get_system_prompt(),
        "- Overview (id: v_over) (active)",
        fixed = TRUE
      )

      views  <- client_r()$get_tools()$list_views()
      ids    <- vapply(views, function(x) x$id, character(1L))
      active <- vapply(views, function(x) x$active, logical(1L))
      expect_identical(active[ids == "v_over"], TRUE)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal(),
      view_data = vd
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

      res <- client_r()$get_tools()$list_blocks()

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

      res <- client_r()$get_tools()$describe_block(id = "d")

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

      res <- client_r()$get_tools()$describe_block(id = "no-such-block")

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
  fake_update <- recording_update(function(payload) calls <<- calls + 1L)

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
  fake_update <- recording_update(
    function(payload) {
      calls <<- calls + 1L
      captured[[length(captured) + 1L]] <<- payload
    }
  )

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
  fake_update <- recording_update(
    function(payload) captured[[length(captured) + 1L]] <<- payload
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      tools <- client_r()$get_tools()

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

test_that("empty-board demo app file constructs a shiny.appobj", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "empty-board", "app.R",
                     package = "blockr.assistant")

  if (!nzchar(src)) {
    skip("Demo app not found in installed package")
  }

  env <- new.env()
  app <- source(src, local = env)$value

  expect_s3_class(app, "shiny.appobj")
})

test_that("populated-board demo app file constructs a shiny.appobj", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  src <- system.file("examples", "populated-board", "app.R",
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

      prompt <- client_r()$get_system_prompt()
      expect_match(prompt, "## Tools", fixed = TRUE)
      expect_match(prompt, "## Board", fixed = TRUE)
      expect_match(prompt, "d <dataset_block>", fixed = TRUE)
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

      expect_identical(client_r()$get_system_prompt(), "STATIC")

      # mutate board to trigger the refresh observer
      board$board <- new_board(blocks = c(x = new_dataset_block("iris")))
      session$flushReact()

      expect_identical(client_r()$get_system_prompt(), "STATIC")
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

      before <- client_r()$get_system_prompt()
      expect_match(before, "0 block(s)", fixed = TRUE)

      board$board <- new_board(blocks = c(x = new_dataset_block("iris")))
      session$flushReact()

      after <- client_r()$get_system_prompt()
      expect_match(after, "1 block(s)", fixed = TRUE)
      expect_match(after, "x <dataset_block>", fixed = TRUE)
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
  flaky_prompt <- function(board, client, ...) {
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

      expect_identical(client_r()$get_system_prompt(), "FIRST")

      board$board <- new_board(
        blocks = c(x = new_dataset_block("iris"))
      )
      session$flushReact()

      # composer threw -> prompt unchanged
      expect_identical(client_r()$get_system_prompt(), "FIRST")
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

test_that("llm_model swap rebuilds the client and migrates turns", {

  fake_a <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(
      model = "gpt-a",
      credentials = function() list(Authorization = "Bearer a"),
      echo = "none"
    )
  }
  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_anthropic(
      model = "claude-b",
      credentials = function() list(`x-api-key` = "b"),
      echo = "none"
    )
  }

  opts <- list(A = fake_a, B = fake_b)
  withr::local_options(blockr.chat_function = opts)

  sess <- shiny::MockShinySession$new()
  blockr.core:::board_option_to_userdata(
    new_llm_model_option(),
    session = sess
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      # Initial mount uses fake_a -> OpenAI provider
      expect_true(
        inherits(client_r()$get_provider(), "ellmer::ProviderOpenAI")
      )

      # Seed a synthetic completed exchange on the current client.
      # A trailing user turn would be dropped on swap (it has no
      # assistant reply, see make_client) -- so include both sides
      # of the exchange so the migration test exercises a real
      # carry-over.
      client_r()$set_turns(
        list(
          ellmer::Turn("user", "remember 42"),
          ellmer::Turn("assistant", "ok, 42 noted")
        )
      )
      first_client <- client_r()

      # Trigger the option-change observer by writing to the option's
      # reactiveVal (same path as the selectInput callback).
      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      # Client identity changed
      expect_false(identical(client_r(), first_client))

      # New client is the Anthropic provider
      expect_true(
        inherits(client_r()$get_provider(), "ellmer::ProviderAnthropic")
      )

      # Both turns of the completed exchange migrated
      turns <- client_r()$get_turns()
      user_turns <- Filter(function(t) t@role == "user", turns)
      expect_length(user_turns, 1L)
      expect_match(user_turns[[1L]]@contents[[1L]]@text, "remember 42")
      assistant_turns <- Filter(
        function(t) t@role == "assistant", turns
      )
      expect_length(assistant_turns, 1L)

      # Tools re-registered (34 surface-tools, same as initial mount)
      expect_length(client_r()$get_tools(), 34L)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = sess
  )
})

test_that("llm_model swap drops an empty assistant placeholder", {

  # Simulates the post-stream-error state: ellmer's stream_async
  # appends a user turn AND an empty assistant placeholder when
  # the stream starts; if the stream errors before the placeholder
  # is filled, the prior client carries both. On swap, shinychat's
  # client_set_ui would render the empty assistant as a perpetual
  # loading spinner -- both turns must be dropped.

  fake_a <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(
      model = "gpt-a",
      credentials = function() list(Authorization = "Bearer a"),
      echo = "none"
    )
  }
  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_anthropic(
      model = "claude-b",
      credentials = function() list(`x-api-key` = "b"),
      echo = "none"
    )
  }

  opts <- list(A = fake_a, B = fake_b)
  withr::local_options(blockr.chat_function = opts)

  sess <- shiny::MockShinySession$new()
  blockr.core:::board_option_to_userdata(
    new_llm_model_option(),
    session = sess
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      # Construct the (user, empty-assistant) shape ellmer leaves
      # behind after a failed stream.
      empty_assistant <- ellmer::Turn("assistant", "")
      empty_assistant@contents <- list()
      client_r()$set_turns(
        list(ellmer::Turn("user", "errored question"), empty_assistant)
      )

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      # Both the empty assistant and the orphaned user beneath
      # it should be trimmed -- the new client starts clean.
      turns <- client_r()$get_turns()
      expect_length(turns, 0L)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = sess
  )
})

test_that("llm_model swap drops a trailing user turn (no auto-submit)", {

  fake_a <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(
      model = "gpt-a",
      credentials = function() list(Authorization = "Bearer a"),
      echo = "none"
    )
  }
  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_anthropic(
      model = "claude-b",
      credentials = function() list(`x-api-key` = "b"),
      echo = "none"
    )
  }

  opts <- list(A = fake_a, B = fake_b)
  withr::local_options(blockr.chat_function = opts)

  sess <- shiny::MockShinySession$new()
  blockr.core:::board_option_to_userdata(
    new_llm_model_option(),
    session = sess
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      # Stage a conversation that ends on an unanswered user turn
      # (the prior provider errored out before responding, say).
      client_r()$set_turns(
        list(ellmer::Turn("user", "unanswered question"))
      )

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      # The trailing user turn was dropped on swap -- the new client
      # has no pending user turn to render as "awaiting response".
      turns <- client_r()$get_turns()
      user_turns <- Filter(function(t) t@role == "user", turns)
      expect_length(user_turns, 0L)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = sess
  )
})

test_that("uncommitted changes at turn end nudge the model, nothing applies", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  calls <- 0L
  fake_update <- recording_update(function(payload) calls <<- calls + 1L)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "h", new_head_block())
      nudge_or_discard()

      expect_identical(calls, 0L)
      expect_true(isolate(has_any_changes(pending_update())))
      expect_identical(isolate(report$count), 1L)

      nudge <- isolate(report$nudge)
      expect_false(is.null(nudge))
      expect_match(nudge$msg, "commit", fixed = TRUE)
      expect_match(nudge$msg, "discard", fixed = TRUE)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = fake_update
    ),
    session = with_llm_session()
  )
})

test_that("an unresolved nudge is bounded, then discards the staged changes", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))
  calls <- 0L
  fake_update <- recording_update(function(payload) calls <<- calls + 1L)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "h", new_head_block())
      report$count <- max_nudges
      before <- isolate(report$nudge)

      nudge_or_discard()

      expect_false(isolate(has_any_changes(pending_update())))
      expect_identical(isolate(report$nudge), before)
      expect_identical(calls, 0L)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = fake_update
    ),
    session = with_llm_session()
  )
})

test_that("an injected turn keeps the pending; a real user turn resets it", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "h", new_head_block())
      report$count <- 2L
      report$injecting <- TRUE

      on_user_input()

      expect_false(isolate(report$injecting))
      expect_true(isolate(has_any_changes(pending_update())))
      expect_identical(isolate(report$count), 2L)

      on_user_input()

      expect_false(isolate(has_any_changes(pending_update())))
      expect_identical(isolate(report$count), 0L)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a repeated nudge re-fires the injection with a fresh sequence id", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "h", new_head_block())

      nudge_or_discard()
      first <- isolate(report$nudge)

      nudge_or_discard()
      second <- isolate(report$nudge)

      expect_identical(first$msg, second$msg)
      expect_false(identical(first$n, second$n))
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})
