custom_tool <- function(name = "find_studies") {
  ellmer::tool(
    function(query) paste("Studies matching", query),
    name = name,
    description = "Find the studies whose title matches a pattern.",
    arguments = list(
      query = ellmer::type_string("Regular expression to match titles.")
    )
  )
}

custom_board_args <- function() {
  list(
    board = reactiveValues(board = blockr.core::new_board()),
    update = reactiveVal()
  )
}

test_that("the tools option is registered on the client", {

  withr::local_options(blockr.assistant_tools = list(custom_tool()))

  client <- fake_chat_function()
  register_custom_tools(client)

  tools <- client$get_tools()

  expect_named(tools, "find_studies")
  expect_identical(tools$find_studies("III"), "Studies matching III")
})

test_that("an unset tools option registers nothing", {

  client <- fake_chat_function()
  register_custom_tools(client)

  expect_length(client$get_tools(), 0L)
})

test_that("a tools option that is not a list of tools errors", {

  withr::local_options(blockr.assistant_tools = custom_tool())

  expect_error(
    register_custom_tools(fake_chat_function()),
    class = "invalid_tools_option"
  )

  withr::local_options(blockr.assistant_tools = list(custom_tool(), "x"))

  expect_error(
    register_custom_tools(fake_chat_function()),
    class = "invalid_tools_option"
  )
})

test_that("a tools option read from the environment errors", {

  withr::local_envvar(BLOCKR_ASSISTANT_TOOLS = "find_studies")

  expect_error(
    register_custom_tools(fake_chat_function()),
    class = "invalid_tools_option"
  )
})

test_that("a tool name used twice in the option errors", {

  withr::local_options(
    blockr.assistant_tools = list(custom_tool(), custom_tool())
  )

  expect_error(
    register_custom_tools(fake_chat_function()),
    "find_studies is used more than once",
    class = "invalid_tools_option"
  )
})

test_that("a tool may not take a typed tool's name", {

  withr::local_options(
    blockr.assistant_tools = list(custom_tool("add_head_block"))
  )

  expect_error(
    register_custom_tools(fake_chat_function()),
    "add_head_block in the assistant_tools option is taken",
    class = "invalid_tools_option"
  )
})

test_that("server builds every client with the deployment's tools", {

  fake_b <- function(system_prompt = NULL, params = NULL) {
    ellmer::chat_anthropic(
      model = "claude-b",
      credentials = function() list(`x-api-key` = "b"),
      echo = "none"
    )
  }

  withr::local_options(
    blockr.chat_function = list(A = fake_chat_function, B = fake_b),
    blockr.assistant_tools = list(custom_tool())
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      session$flushReact()

      tools <- client_r()$get_tools()

      expect_length(tools, 37L)
      expect_identical(
        tools$find_studies@annotations$title, "Find studies"
      )

      first_client <- client_r()

      rv <- session$userData$board_options[["llm_model"]]
      rv(structure(fake_b, chat_name = "B"))
      session$flushReact()

      expect_false(identical(client_r(), first_client))
      expect_true("find_studies" %in% names(client_r()$get_tools()))
    },
    args = custom_board_args(),
    session = with_llm_session()
  )
})

test_that("a tool named like a built-in one leaves the chat unbuilt", {

  withr::local_options(
    blockr.chat_function = fake_chat_function,
    blockr.assistant_tools = list(custom_tool("commit"))
  )

  testServer(
    asst_ext_srv(system_prompt = default_system_prompt),
    {
      logs <- capture_logs(session$flushReact())

      expect_null(client_r())
      expect_match(
        logs,
        "Could not build chat client: Tool name commit in the",
        fixed = TRUE
      )
    },
    args = custom_board_args(),
    session = with_llm_session()
  )
})
