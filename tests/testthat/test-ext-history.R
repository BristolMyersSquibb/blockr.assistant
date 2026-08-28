# The unit tests above mock chat_server(), so nothing there exercises the seam
# this feature actually rests on: shinychat's own history controller writing
# into the store this package hands it. These drive the real thing.
#
# Reaching the controller through session$userData is how shinychat stashes it
# (set_session_chat_bookmark_info). Setting the partition by hand stands in for
# the browser flush that resolves it, which no testServer ever sends.
history_controller <- function(session) {
  session$userData$shinychat[[session$ns("chat.history-controller")]]
}

fake_partition <- function(chat_id = "chat", scope = "board") {
  structure(
    list(chat_id = chat_id, scope = scope),
    class = "shinychat_conversation_partition"
  )
}

recorded <- function(client) {
  lapply(client$get_turns(), ellmer::contents_record)
}

test_that("a response lands in this board's thread store", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
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
      saved <- deserialize_chat_history(session$returned$state$history())

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
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
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

test_that("switching threads restores the client and the focus selection", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  brd <- new_board(blocks = c(d = new_dataset_block("iris")))

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt, messages = NULL),
    {
      session$flushReact()

      ctrl <- history_controller(session)
      ctrl$partition <- fake_partition()

      cl <- client_r()

      session$setInputs(focus = "d")
      cl$set_turns(
        list(ellmer::Turn("user", "one"), ellmer::Turn("assistant", "first"))
      )
      ctrl$on_response(recorded(cl))

      first <- ctrl$record$id

      # The focus selection was captured with the thread, through the on_save
      # hook this extension registers.
      expect_identical(ctrl$record$values[["focus"]], list("d"))

      ctrl$new_chat()
      session$setInputs(focus = character())
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
