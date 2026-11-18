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

test_that("the plugin prints a line for each conversation", {

  # The state lists the conversations in an order other than that of their
  # times.
  revenue <- conversation("Revenue by month")
  revenue[["updated"]] <- "2026-11-16T09:30:00Z"
  revenue[["model"]] <- "gpt-5.4"
  revenue[["messages"]] <- c(
    revenue[["messages"]],
    list(
      list(
        id = "m2",
        role = "assistant",
        parts = list(list(type = "text", text = "I'll add a summary block.")),
        created = "2026-11-16T09:30:00Z"
      )
    )
  )

  fresh <- conversation("New conversation")
  fresh[["updated"]] <- "2026-11-16T07:00:00Z"
  fresh[["messages"]] <- list()

  plugin <- new_assistant_plugin(
    list(c1 = conversation(), c2 = fresh, c3 = revenue)
  )

  expect_snapshot(print(plugin))

  expect_identical(
    format(new_assistant_plugin()),
    "<assistant_plugin> blockr.assistant-assistant_plugin"
  )
})

test_that("the print keeps the state's order for conversations of one time", {

  # The helper gives both conversations the same time.
  # The state lists b before a, against the order of their ids.
  plugin <- new_assistant_plugin(
    list(b = conversation("Second"), a = conversation("First"))
  )

  expect_identical(
    format(plugin)[-1L],
    c(
      "b: Second (1 message, default model, updated 2026-11-16T08:00:00Z)",
      "a: First (1 message, default model, updated 2026-11-16T08:00:00Z)"
    )
  )
})

test_that("a board prints the assistant's plugin that it holds", {

  plugin <- new_assistant_plugin(list(c1 = conversation()))

  expect_output(
    print(new_board(plugins = list(plugin))),
    paste(format(plugin), collapse = "\n"),
    fixed = TRUE
  )
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

test_that("OpenRouter's login page and its script ship beside the module", {

  dir <- system.file("js", package = "blockr.assistant")
  page <- readLines(file.path(dir, "openrouter.html"))
  script <- regmatches(page, regexpr("openrouter-[0-9a-f]{8}[.]js", page))

  expect_length(script, 1L)
  expect_true(file.exists(file.path(dir, script)))
})
