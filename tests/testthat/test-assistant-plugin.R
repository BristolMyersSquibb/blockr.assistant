test_that("new_assistant_plugin() makes a plugin of the assistant's class", {

  plugin <- new_assistant_plugin()

  expect_s3_class(plugin, c("assistant_plugin", "plugin"), exact = TRUE)
  expect_identical(
    plugin_class_id(plugin),
    "blockr.assistant-assistant_plugin"
  )
  expect_identical(plugin_state(plugin), list(conversations = list()))
  expect_identical(plugin_version(plugin), 1L)
})

test_that("new_assistant_plugin() takes a board's conversations by id", {

  conversations <- list(c1 = conversation(), c2 = conversation())

  expect_identical(
    plugin_state(new_assistant_plugin(conversations))[["conversations"]],
    conversations
  )

  for (refused in list(
    list(conversation()),
    list(c1 = conversation(), conversation()),
    list(c1 = conversation(), c1 = conversation()),
    "c1",
    data.frame(c1 = 1)
  )) {
    expect_error(
      new_assistant_plugin(refused),
      class = "invalid_conversations"
    )
  }
})

test_that("R writes the conversations by the schema beside the module", {

  written <- function(plugin) {
    board <- blockr_ser(new_board(plugins = list(plugin)))
    board[["board"]][["plugins"]][["blockr.assistant-assistant_plugin"]]
  }

  expect_identical(
    written(new_assistant_plugin()),
    list(conversations = set_names(list(), character()))
  )

  state <- written(new_assistant_plugin(list(c1 = conversation())))
  c1 <- state[["conversations"]][["c1"]]

  expect_null(names(c1[["messages"]]))
  expect_length(c1[["messages"]], 1L)
  expect_null(names(c1[["messages"]][[1L]][["parts"]]))
  expect_length(c1[["messages"]][[1L]][["parts"]], 1L)
})

test_that("the package ships the schema of the state beside the module", {

  schema <- read_json_schema(
    "js/assistant_plugin.schema.json",
    package = "blockr.assistant"
  )

  expect_named(schema[["properties"]], "conversations")
})

test_that("available_plugins() gives the class that the package lists", {

  plugins <- available_plugins()

  expect_identical(
    plugins[plugins[["package"]] == "blockr.assistant", "id"],
    "assistant_plugin"
  )
})

test_that("the package ships the module that it lists for the class", {

  module <- ._BLOCKR_MODULES_[["plugins"]][["new_assistant_plugin"]][["module"]]

  expect_true(nzchar(system.file(module, package = "blockr.assistant")))
})
