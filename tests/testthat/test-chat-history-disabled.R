test_that("the chat module is mounted with history disabled", {

  withr::local_options(blockr.chat_function = fake_chat_function)

  history_arg <- NULL

  testthat::local_mocked_bindings(
    chat_mod_server = function(id, client, history = TRUE, ...) {
      history_arg <<- history
      NULL
    },
    .package = "shinychat"
  )

  testServer(
    asst_ext_srv(default_system_prompt, NULL),
    {
      session$flushReact()

      expect_false(history_arg)
    },
    args = list(
      board = reactiveValues(board = blockr.core::new_board()),
      update = reactiveVal()
    ),
    session = with_llm_session()
  )
})
