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

test_that("format_token_telemetry reports zeros before a turn arrives", {

  html <- as.character(format_token_telemetry(c(0L, 0L)))

  expect_match(html, "asst-meta", fixed = TRUE)
  expect_match(html, ">0<")
  expect_match(html, "Input tokens (this conversation): 0", fixed = TRUE)
})

test_that("format_token_telemetry reports what the conversation has spent", {

  res <- format_token_telemetry(c(312L, 84L))
  expect_s3_class(res, "shiny.tag")

  html <- as.character(res)
  expect_match(html, "asst-meta", fixed = TRUE)
  expect_match(html, ">312<")
  expect_match(html, ">84<")
})

test_that("the chat mounts history against this board's thread store", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  history_arg <- NULL

  testthat::local_mocked_bindings(
    chat_server = function(id, client, history = TRUE, ...) {
      history_arg <<- history
      fake_chat_mod()
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(default_system_prompt),
    {
      session$flushReact()

      expect_s3_class(history_arg, "chat_history_config")
      expect_s3_class(history_arg$store, "ThreadStore")

      # Evicting a thread the user is still reading would be a surprise; the
      # save budget is what bounds the file.
      expect_null(history_arg$max_store_mb)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("function-arg system_prompt is omitted from state", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      expect_named(session$returned$state, "history")
      expect_null(session$returned$state$history())
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("the conversation is written to state", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  seed <- list(
    ellmer::Turn("user", "load iris"),
    ellmer::Turn("assistant", "loaded")
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      # An exchange the store has not recorded yet: shinychat writes a thread
      # once the model answers, and saving before that must not lose it.
      client_r()$set_turns(seed)

      expect_length(client_r()$get_turns(), 2L)

      saved <- session$returned$state$history()

      expect_type(saved, "list")

      threads <- saved

      expect_true(is_thread_set(threads))
      expect_length(threads, 1L)
      expect_length(thread_turns(threads[["c_restored"]]), 2L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("chat_save_turns = 0 writes no conversation to state", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_save_turns = 0L
  )

  seed <- list(
    ellmer::Turn("user", "load iris"), ellmer::Turn("assistant", "ok")
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(seed)

      expect_length(client_r()$get_turns(), 2L)
      expect_null(session$returned$state$history())
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("chat_save_turns keeps only the most recent turns", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_save_turns = 2L
  )

  seed <- list(
    ellmer::Turn("user", "question 1"),
    ellmer::Turn("assistant", "answer 1"),
    ellmer::Turn("user", "question 2"),
    ellmer::Turn("assistant", "answer 2"),
    ellmer::Turn("user", "question 3"),
    ellmer::Turn("assistant", "answer 3")
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(seed)

      kept <- lapply(
        thread_turns(
          session$returned$state$history()[["c_restored"]]
        ),
        ellmer::contents_replay
      )

      expect_length(kept, 2L)
      expect_identical(
        lapply(kept, ellmer::contents_text),
        list("question 3", "answer 3")
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a saved conversation survives the board round trip", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  turns <- list(
    ellmer::Turn("user", "load iris"),
    ellmer::Turn("assistant", "loaded it")
  )

  ser <- blockr.core::blockr_ser(
    new_assistant_extension(),
    data = list(
      history = serialize_chat_threads(
        new_thread_store(), 50L, unrecorded = turns
      )
    )
  )

  ext <- blockr.core::blockr_deser(via_board_file(ser))

  testServer(
    blockr.dock::extension_server(ext),
    {
      session$flushReact()

      # The store is what carries a thread now; shinychat puts its turns on
      # the client when the browser says which thread was open, which no
      # testServer ever does.
      restored <- thread_store$threads()

      expect_named(restored, "c_restored")
      expect_identical(
        lapply(
          lapply(
            thread_turns(restored[["c_restored"]]),
            ellmer::contents_replay
          ),
          ellmer::contents_text
        ),
        lapply(turns, ellmer::contents_text)
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("deser drops a payload key that is no longer a constructor arg", {

  ser <- blockr.core::blockr_ser(
    new_assistant_extension(),
    data = list(
      messages = lapply(
        list(ellmer::Turn("user", "hi"), ellmer::Turn("assistant", "hello")),
        ellmer::contents_record
      )
    )
  )

  ext <- blockr.core::blockr_deser(via_board_file(ser))

  expect_s3_class(ext, "assistant_extension")

  # Left in place it reaches the constructor as an unused argument and takes
  # the board down on mount.
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
    asst_ext_srv(system_prompt = "be terse"),
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
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()

      expect_length(tools, 36L)
      expect_setequal(
        names(tools),
        c(
          "list_blocks", "describe_block", "list_links",
          "list_stacks", "describe_stack",
          "list_block_types", "describe_block_type",
          "get_block_result", "get_block_state",
          "get_block_conditions", "query_data",
          "add_block", "remove_block", "modify_block",
          "add_link", "remove_link", "modify_link",
          "add_stack", "remove_stack", "modify_stack",
          "commit", "discard",
          "list_views", "validate_layout",
          "add_view", "remove_view",
          "add_panel_to_view", "remove_panel_from_view", "move_panel",
          "resize_panel", "focus_panel", "set_active_view", "rename_view",
          "list_board_options", "set_board_option",
          "read_skill"
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

test_that("describing a block type arms its typed tool on the client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      client <- client_r()

      expect_false("add_head_block" %in% names(client$get_tools()))

      res <- client$get_tools()[["describe_block_type"]]("head_block")

      expect_match(res$typed_tool, "add_head_block")
      expect_true("add_head_block" %in% names(client$get_tools()))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a fresh user turn lets the pool reclaim an armed tool", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.assistant_block_tool_pool = 1L
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      client <- client_r()
      describe <- client$get_tools()[["describe_block_type"]]

      describe("head_block")

      expect_match(describe("merge_block")$typed_tool, "pool is full")

      on_user_input()

      expect_match(describe("merge_block")$typed_tool, "add_merge_block")
      expect_false("add_head_block" %in% names(client$get_tools()))
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
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()

      expect_length(tools, 39L)
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      prompt <- client_r()$get_system_prompt()
      expect_no_match(prompt, "## Tools", fixed = TRUE)
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
    asst_ext_srv(system_prompt = "STATIC"),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = flaky_prompt),
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

  sess <- with_llm_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
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

      # Tools re-registered (36 surface tools, same as initial mount)
      expect_length(client_r()$get_tools(), 36L)
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

  sess <- with_llm_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
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

  sess <- with_llm_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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
    asst_ext_srv(system_prompt = default_system_prompt),
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

test_that("a conversation over the token bound is compacted", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = 100L
  )

  mod <- fake_chat_mod()

  testthat::local_mocked_bindings(
    chat_server = function(id, client, history = TRUE, ...) mod,
    .package = "shinychat"
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("iris loaded, plot built")
    }
  )

  testServer(
    asst_ext_srv(default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(priced_turns(12L, 400, 50))
      mod$history$restore()
      later::run_now()
      session$flushReact()

      turns <- client_r()$get_turns()

      expect_length(turns, 10L)
      expect_identical(turns[[1L]]@role, "user")
      expect_identical(turn_text(turns[[2L]]), "iris loaded, plot built")
      expect_identical(turn_text(turns[[3L]]), "5")

      expect_identical(mod$transcript()[[2L]],
                       "assistant: iris loaded, plot built")
      expect_length(mod$transcript(), 10L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a conversation within the token bound is left alone", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = 10000L
  )

  mod <- fake_chat_mod()

  testthat::local_mocked_bindings(
    chat_server = function(id, client, history = TRUE, ...) mod,
    .package = "shinychat"
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      stop("must not be called")
    }
  )

  testServer(
    asst_ext_srv(default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(priced_turns(12L, 400, 50))
      mod$history$restore()
      later::run_now()
      session$flushReact()

      expect_length(client_r()$get_turns(), 12L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("compaction defers while a stream is in flight", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = 100L
  )

  mod <- fake_chat_mod(status = "streaming")

  testthat::local_mocked_bindings(
    chat_server = function(id, client, history = TRUE, ...) mod,
    .package = "shinychat"
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("summary")
    }
  )

  testServer(
    asst_ext_srv(default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(priced_turns(12L, 400, 50))
      mod$history$restore()
      later::run_now()
      session$flushReact()

      expect_length(client_r()$get_turns(), 12L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("user-invocable skills reach shinychat as slash commands", {

  root <- local_skills_dir()

  write_skill(
    root, "drill",
    c("name: drill", "description: A drill.", "user-invocable: true")
  )
  write_skill(
    root, "model-only", c("name: model-only", "description: Not a command.")
  )

  withr::local_options(blockr.chat_function = fake_chat_function)

  rec <- recording_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      # One flush mounts the chat and registers the commands from the
      # flushed hook; the advertisement goes out on the next.
      session$flushReact()

      commands <- rec$slash_commands()

      expect_setequal(chr_xtr(commands, "name"), c("compact", "drill"))
      expect_true("A drill." %in% chr_xtr(commands, "description"))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = rec$session
  )
})

test_that("the built-in commands are advertised without an echo", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  rec <- recording_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()
      session$flushReact()

      commands <- rec$slash_commands()
      builtin <- chr_xtr(commands, "name") %in% "compact"

      expect_length(which(builtin), 1L)
      expect_false(any(lgl_xtr(commands[builtin], "echo")))

      # A skill command echoes, so this is the built-ins being asked for
      # something else rather than shinychat defaulting everything off.
      expect_true(all(lgl_xtr(commands[!builtin], "echo")))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = rec$session
  )
})

test_that("a skill cannot take a built-in command's name", {

  root <- local_skills_dir()

  write_skill(
    root, "compact",
    c(
      "name: compact", "description: A deployment skill.",
      "user-invocable: true"
    )
  )

  withr::local_options(blockr.chat_function = fake_chat_function)

  rec <- recording_session()

  logs <- capture_logs(
    testServer(
      asst_ext_srv(system_prompt = default_system_prompt),
      {
        session$flushReact()
        session$flushReact()

        commands <- rec$slash_commands()
        taken <- chr_xtr(commands, "name") == "compact"

        expect_length(which(taken), 1L)
        expect_false(
          "A deployment skill." %in% chr_xtr(commands[taken], "description")
        )
      },
      args = list(
        board = reactiveValues(board = blockr.core::new_board()),
        update = reactiveVal()
      ),
      session = rec$session
    )
  )

  expect_match(logs, "Slash command /compact was not registered")
})

test_that("/compact summarises a conversation the bound leaves alone", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  mod <- fake_chat_mod()

  testthat::local_mocked_bindings(
    chat_server = function(id, client, history = TRUE, ...) mod,
    .package = "shinychat"
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("iris loaded, plot built")
    }
  )

  testServer(
    asst_ext_srv(default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(priced_turns(12L, 400, 50))
      mod$history$restore()
      later::run_now()
      session$flushReact()

      expect_length(client_r()$get_turns(), 12L)

      compact_conversation()

      later::run_now()
      session$flushReact()

      turns <- client_r()$get_turns()

      expect_length(turns, 10L)
      expect_identical(turn_text(turns[[2L]]), "iris loaded, plot built")
      expect_identical(turn_text(turns[[3L]]), "5")
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a fresh thread drops changes staged against the one before it", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  open_thread <- NULL

  testthat::local_mocked_bindings(
    chat_server = function(id, client, greeting = NULL, history = TRUE, ...) {
      open_thread <<- greeting
      fake_chat_mod()
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      stage_block_add(pending_update, board, "new", new_head_block())
      touched("d")
      report$count <- 2L

      expect_true(isolate(has_any_changes(pending_update())))

      # Resolving the greeting is shinychat's only public signal that a fresh
      # thread has opened -- on the initial settle, and on every new one.
      open_thread()

      expect_false(isolate(has_any_changes(pending_update())))
      expect_identical(isolate(touched()), character())
      expect_identical(report$count, 0L)
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a mistyped skills directory takes the mount down", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.assistant_skills = file.path(tempdir(), "no-such-skills-dir")
  )

  expect_error(
    testServer(
      asst_ext_srv(system_prompt = default_system_prompt),
      session$flushReact(),
      args = list(
        board = reactiveValues(board = blockr.core::new_board()),
        update = reactiveVal()
      ),
      session = with_llm_session()
    ),
    class = "missing_skills_dir"
  )
})

test_that("asst_focus_select builds an uncapped multi-select block picker", {

  brd <- new_board(
    blocks = c(a = new_dataset_block("iris"), b = new_head_block())
  )

  html <- as.character(asst_focus_select("focus", brd, c("a", "b"), "b"))

  expect_match(html, "multiple=\"multiple\"", fixed = TRUE)
  expect_no_match(html, "maxItems", fixed = TRUE)
  expect_match(html, "\"items\":[\"b\"]", fixed = TRUE)
  expect_match(html, "remove_button", fixed = TRUE)
  expect_match(html, "\"dropdownParent\":\"body\"", fixed = TRUE)
})

test_that("the focus picker offers the live board's blocks", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  board <- reactiveValues(
    board = new_board(blocks = c(a = new_dataset_block("iris")))
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      expect_match(output$focus_picker$html, "ID: a", fixed = TRUE)
      expect_no_match(output$focus_picker$html, "ID: b", fixed = TRUE)

      board$board <- new_board(
        blocks = c(a = new_dataset_block("iris"), b = new_head_block())
      )
      session$flushReact()

      expect_match(output$focus_picker$html, "ID: b", fixed = TRUE)
    },
    args = list(board = board, update = reactiveVal()),
    session = with_llm_session()
  )
})

test_that("the picker is absent while the board holds no blocks", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      expect_null(output$focus_picker)
    },
    args = list(
      board = reactiveValues(board = new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a picker selection reaches the model's system prompt", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  board <- reactiveValues(
    board = new_board(
      blocks = c(a = new_dataset_block("iris"), b = new_head_block())
    )
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      expect_no_match(
        client_r()$get_system_prompt(), "## Focus", fixed = TRUE
      )

      session$setInputs(focus = "b")

      expect_match(
        client_r()$get_system_prompt(),
        "- b <head_block> n, direction",
        fixed = TRUE
      )

      session$setInputs(focus = character())

      expect_no_match(
        client_r()$get_system_prompt(), "## Focus", fixed = TRUE
      )
    },
    args = list(board = board, update = reactiveVal()),
    session = with_llm_session()
  )
})

test_that("removing a focused block drops it from the prompt", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  board <- reactiveValues(
    board = new_board(
      blocks = c(a = new_dataset_block("iris"), b = new_head_block())
    )
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$setInputs(focus = c("a", "b"))

      expect_match(
        client_r()$get_system_prompt(), "- b <head_block>", fixed = TRUE
      )

      board$board <- new_board(blocks = c(a = new_dataset_block("iris")))
      session$flushReact()

      prompt <- client_r()$get_system_prompt()

      expect_match(prompt, "## Focus", fixed = TRUE)
      expect_match(prompt, "- a <dataset_block>", fixed = TRUE)
      expect_no_match(prompt, "- b <head_block>", fixed = TRUE)
    },
    args = list(board = board, update = reactiveVal()),
    session = with_llm_session()
  )
})

test_that("a provider swap hands the client over instead of remounting", {

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

  withr::local_options(blockr.chat_function = list(A = fake_a, B = fake_b))

  mounts <- 0L
  handed <- NULL

  testthat::local_mocked_bindings(
    chat_server = function(id, client, ...) {

      mounts <<- mounts + 1L

      mod <- fake_chat_mod(client = client)
      mod$set_client <- function(new_client, sync = TRUE) {
        handed <<- list(client = new_client, sync = sync)
        invisible()
      }

      mod
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      # A remount would render a fresh chat element, and the store partitions
      # on that element's id, so every thread recorded before the swap would
      # be stranded under the old one.
      expect_identical(mounts, 1L)
      expect_identical(handed$client, client_r())

      # The turns are carried here already, and the tools belong to the
      # client they were registered against.
      expect_false(handed$sync)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("focus rides with the thread and a switch resets the slate", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  on_save <- NULL
  on_restore <- NULL

  testthat::local_mocked_bindings(
    chat_server = function(id, client, ...) {

      mod <- fake_chat_mod(client = client)
      mod$history <- list(
        save = function() FALSE,
        on_save = function(fn) on_save <<- fn,
        on_restore = function(fn) on_restore <<- fn
      )

      mod
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()
      session$setInputs(focus = "d")

      # Board state carries `values` as plain JSON, which returns a character
      # vector as a list, so the saved shape is a list either way.
      expect_identical(on_save(list())[["focus"]], list("d"))

      stage_block_add(pending_update, board, "new", new_head_block())
      expect_true(isolate(has_any_changes(pending_update())))

      on_restore(list(focus = list("d")))

      expect_false(isolate(has_any_changes(pending_update())))
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("saving state survives a module with no history save", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  seed <- list(
    ellmer::Turn("user", "load iris"), ellmer::Turn("assistant", "ok")
  )

  # The shape `chat_server()` handed back when the save path was written:
  # `mod$history` a LOCKED environment carrying `on_save` and `on_restore`,
  # with `save_current()` on the history controller behind it rather than on
  # the module. Saving state used to ask that object for a `save()`, and
  # since `mod$history$save` was NULL and the call head is an expression
  # rather than a symbol, every board save on a session that had mounted the
  # chat died on "attempt to apply non-function". The tests above, which let
  # the real `chat_server()` mount, said so and were read as noise. This one
  # mocks the module, which is where the miss was: the double used to carry
  # a `save()` the module did not have, and this test asserted the call.
  #
  # Upstream added a module-level `save()` in shinychat `7484ce6e`
  # (2026-08-25), so this is deliberately NOT the current shape. It is the
  # shape that broke, kept as the guard: state has to serialize without
  # reaching for a save the module may not offer.
  testthat::local_mocked_bindings(
    chat_server = function(id, client, ...) {

      hist_env <- new.env(parent = emptyenv())
      hist_env$on_save <- function(fn) invisible(fn)
      hist_env$on_restore <- function(fn) invisible(fn)
      lockEnvironment(hist_env, bindings = TRUE)

      mod <- fake_chat_mod(client = client)
      mod$history <- hist_env

      mod
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      client_r()$set_turns(seed)

      # Mounting reads `on_save` / `on_restore` off the same object, so this
      # covers the whole lifecycle against the real shape, not just the save.
      saved <- session$returned$state$history()

      expect_true(is_thread_set(saved))
      expect_length(thread_turns(saved[["c_restored"]]), 2L)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})
