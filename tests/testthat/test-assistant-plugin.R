test_that("new_assistant_plugin() makes a plugin of the assistant's class", {

  plugin <- new_assistant_plugin()

  expect_s3_class(plugin, c("assistant_plugin", "plugin"), exact = TRUE)
  expect_identical(
    plugin_class_id(plugin),
    "blockr.assistant-assistant_plugin"
  )
  expect_length(plugin_state(plugin), 0L)
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
