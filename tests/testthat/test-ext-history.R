# The unit tests above mock chat_server(), so nothing there exercises the seam
# this feature actually rests on: shinychat's own history controller writing
# into the store this package hands it. These drive the real thing.
#
# Setting the partition by hand stands in for the browser flush that resolves
# it, which no testServer ever sends.
fake_partition <- function(chat_id = "chat", scope = "board") {
  structure(
    list(chat_id = chat_id, scope = scope),
    class = "shinychat_conversation_partition"
  )
}

recorded <- function(client) {
  lapply(client$get_turns(), ellmer::contents_record)
}

# Holds the summary back until the test hands it over, which opens the window
# that a thread change has to fall in.
local_held_summary <- function(env = parent.frame()) {

  resolve <- NULL

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise(function(res, rej) resolve <<- res)
    },
    .env = env
  )

  function(summary) {
    resolve(summary)
    later::run_now()
  }
}

test_that("a response lands in this board's thread store", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      expect_false(is.null(ctrl))

      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      threads <- thread_store$threads()

      expect_length(threads, 1L)
      expect_identical(
        lapply(
          lapply(thread_turns(threads[[1L]]), ellmer::contents_replay),
          ellmer::contents_text
        ),
        list("one", "first")
      )

      # And the same thread is what the board writes out.
      saved <- session$returned$state$history()

      expect_true(is_thread_set(saved))
      expect_named(saved, names(threads))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a second thread is stored beside the first", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      first <- names(thread_store$threads())

      ctrl$new_chat()

      cl$set_turns(
        list(ellmer::Turn("user", "two"), ellmer::Turn("assistant", "second"))
      )
      ctrl$on_response(recorded(cl))

      threads <- thread_store$threads()

      expect_length(threads, 2L)
      expect_true(first %in% names(threads))
      expect_setequal(
        chr_xtr(thread_store$list(fake_partition()), "id"),
        names(threads)
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("switching threads restores the client", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()

      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      first <- ctrl$record$id

      ctrl$new_chat()
      cl$set_turns(
        list(ellmer::Turn("user", "two"), ellmer::Turn("assistant", "second"))
      )
      ctrl$on_response(recorded(cl))

      ctrl$switch_to(first)

      expect_identical(
        lapply(cl$get_turns(), ellmer::contents_text),
        list("one", "first")
      )
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("the meter counts the conversation, not the last exchange", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  priced <- function(input, output) {
    turn <- ellmer::Turn("assistant", "ok")
    turn@tokens <- c(input, output, NA)
    turn
  }

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      on_model_turn(priced(100, 20))
      on_model_turn(priced(150, 30))

      expect_identical(spent(), c(250L, 50L))

      cl <- client_r()
      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      first <- ctrl$record$id
      expect_identical(ctrl$record$values[["spent"]], list(250L, 50L))

      # A fresh thread starts the meter over, and switching back brings the
      # first thread's total with it.
      ctrl$new_chat()
      later::run_now()
      session$flushReact()

      expect_identical(spent(), c(0L, 0L))

      cl$set_turns(
        list(ellmer::Turn("user", "two"), ellmer::Turn("assistant", "second"))
      )
      ctrl$on_response(recorded(cl))
      ctrl$switch_to(first)

      expect_identical(spent(), c(250L, 50L))
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a board rename does not strand the threads recorded before it", {

  # shinychat partitions on the chat element id, which carries the board id,
  # so a rename hands the store a different partition. Ours serves one board
  # and ignores it -- the board's own state is where these threads live, not
  # a partitioned store shared with anyone else. A future store that honoured
  # the partition would strand every thread on rename, which is what this
  # pins down.
  store <- new_thread_store(
    list(c_1 = fake_thread(list(ellmer::Turn("user", "hi"))))
  )

  before <- shinychat:::conversation_partition("board-alpha-chat", "board")
  after  <- shinychat:::conversation_partition("board-renamed-chat", "board")

  expect_false(
    identical(
      shinychat:::partition_key(before),
      shinychat:::partition_key(after)
    )
  )

  expect_length(store$list(after), 1L)
  expect_identical(
    store$get(after, "c_1"),
    store$get(before, "c_1")
  )

  store$put(after, fake_thread(list(ellmer::Turn("user", "two")), id = "c_2"))

  expect_length(store$list(before), 2L)
})

test_that("a compaction redraws the transcript with history enabled", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("iris loaded, plot built")
    }
  )

  rec <- recording_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      compact_conversation()
      later::run_now()
      session$flushReact()

      shown <- rec$transcript()

      expect_length(cl$get_turns(), 10L)
      expect_length(shown, 10L)
      expect_identical(shown[[2L]], "assistant: iris loaded, plot built")
      expect_identical(shown[[3L]], "user: 5")
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = rec$session
  )
})

test_that("an exchange that lands during a compaction is carried over", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  release_summary <- local_held_summary()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      compact_conversation()

      cl$add_turn(
        ellmer::Turn("user", "13"), ellmer::Turn("assistant", "14"),
        log_tokens = FALSE
      )

      release_summary("iris loaded, plot built")
      session$flushReact()

      expect_identical(
        chr_ply(cl$get_turns(), ellmer::contents_text),
        c(compaction_request(), "iris loaded, plot built", as.character(5:14))
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a compaction does not land in a thread opened while it ran", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  release_summary <- local_held_summary()

  rec <- recording_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      compact_conversation()
      ctrl$new_chat()

      release_summary("iris loaded, plot built")
      session$flushReact()

      expect_length(cl$get_turns(), 0L)
      expect_identical(rec$transcript(), character())
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = rec$session
  )
})

test_that("a compaction does not land in a thread switched to while it ran", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  release_summary <- local_held_summary()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(
        list(ellmer::Turn("user", "two"), ellmer::Turn("assistant", "second"))
      )
      ctrl$on_response(recorded(cl))

      other <- ctrl$record$id

      ctrl$new_chat()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      compact_conversation()
      ctrl$switch_to(other)

      release_summary("iris loaded, plot built")
      session$flushReact()

      expect_identical(
        chr_ply(cl$get_turns(), ellmer::contents_text),
        c("two", "second")
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a compaction lands on the client a model switch hands over", {

  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(
      model = "gpt-b",
      credentials = function() list(Authorization = "Bearer b"),
      echo = "none"
    )
  }

  withr::local_options(
    blockr.chat_function = list(A = fake_chat_function, B = fake_b),
    blockr.chat_compact_tokens = Inf
  )

  release_summary <- local_held_summary()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      replaced <- client_r()
      replaced$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(replaced))

      id <- ctrl$record$id

      compact_conversation()

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      expect_false(identical(client_r(), replaced))

      # The swap builds a new history controller, which waits on the same
      # browser flush for its partition.
      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      release_summary("iris loaded, plot built")
      session$flushReact()

      compacted <- c(
        compaction_request(), "iris loaded, plot built", as.character(5:12)
      )

      expect_identical(
        chr_ply(client_r()$get_turns(), ellmer::contents_text),
        compacted
      )
      expect_identical(thread_text(thread_store$threads()[[id]]), compacted)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("a compaction replaces the stored thread", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("iris loaded, plot built")
    }
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      before <- ctrl$record

      compact_conversation()
      later::run_now()
      session$flushReact()

      saved <- session$returned$state$history()

      expect_named(saved, before$id)
      expect_identical(saved[[1L]]$title, before$title)
      expect_identical(
        thread_text(saved[[1L]]),
        c(compaction_request(), "iris loaded, plot built", as.character(5:12))
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("the exchange after a compaction is stored with the thread", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.chat_compact_tokens = Inf
  )

  testthat::local_mocked_bindings(
    summarise_turns = function(client, turns) {
      promises::promise_resolve("iris loaded, plot built")
    }
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()
      cl$set_turns(priced_turns(12L, 400, 50))
      ctrl$on_response(recorded(cl))

      compact_conversation()
      later::run_now()
      session$flushReact()

      cl$add_turn(
        ellmer::Turn("user", "13"), ellmer::Turn("assistant", "14"),
        log_tokens = FALSE
      )
      ctrl$on_response(recorded(cl))

      compacted <- c(
        compaction_request(), "iris loaded, plot built", as.character(5:14)
      )

      expect_identical(
        thread_text(thread_store$threads()[[ctrl$record$id]]),
        compacted
      )

      # Switching away and back loads the stored thread into the client, which
      # is how a skipped exchange would be lost to the model as well.
      thread_store$put(
        fake_partition(),
        fake_thread(alternating_turns(2L), id = "c_other")
      )

      id <- ctrl$record$id

      ctrl$switch_to("c_other")
      ctrl$switch_to(id)

      expect_identical(
        chr_ply(cl$get_turns(), ellmer::contents_text),
        compacted
      )
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})

test_that("/clear keeps the thread on screen and opens a new one", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  rec <- recording_session()

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()

      spent(c(100L, 20L))
      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      first <- ctrl$record$id

      stage_block_add(pending_update, board, "new", new_head_block())

      clear_conversation()
      later::run_now()
      session$flushReact()

      kept <- thread_store$threads()[[first]]

      expect_identical(kept$values[["spent"]], list(100L, 20L))

      expect_null(ctrl$record)
      expect_length(cl$get_turns(), 0L)
      expect_identical(rec$transcript(), character())
      expect_identical(spent(), c(0L, 0L))
      expect_false(isolate(has_any_changes(pending_update())))

      cl$set_turns(
        list(ellmer::Turn("user", "two"), ellmer::Turn("assistant", "second"))
      )
      ctrl$on_response(recorded(cl))

      expect_length(thread_store$threads(), 2L)
      expect_identical(
        lapply(
          lapply(
            thread_turns(thread_store$threads()[[first]]),
            ellmer::contents_replay
          ),
          ellmer::contents_text
        ),
        list("one", "first")
      )
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = rec$session
  )
})

test_that("/clear starts the new thread over after a provider swap", {

  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(
      model = "gpt-b",
      credentials = function() list(Authorization = "Bearer b"),
      echo = "none"
    )
  }

  withr::local_options(
    blockr.chat_function = list(A = fake_chat_function, B = fake_b)
  )

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      # The history controller shinychat builds for the swapped-in client
      # carries the save and restore callbacks over but not the greeting, so a
      # new thread no longer resets its state through it.
      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      spent(c(100L, 20L))
      stage_block_add(pending_update, board, "new", new_head_block())

      clear_conversation()
      later::run_now()
      session$flushReact()

      expect_identical(spent(), c(0L, 0L))
      expect_false(isolate(has_any_changes(pending_update())))
    },
    args = list(
      board = reactiveValues(board = brd),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})
