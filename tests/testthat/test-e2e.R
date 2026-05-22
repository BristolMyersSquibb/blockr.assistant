test_that("demo app boots and the assistant panel reaches the DOM", {

  skip_on_cran()
  skip_if_not_installed("shinytest2")
  skip_if_not_installed("chromote")

  app_dir <- withr::local_tempdir()

  writeLines(
    c(
      "library(blockr.core)",
      "library(blockr.dock)",
      "library(blockr.assistant)",
      "",
      "fake_chat <- function(system_prompt = NULL, params = NULL) {",
      "  ellmer::chat_openai(",
      "    model = 'gpt-4.1-nano',",
      "    credentials = function() {",
      "      list(Authorization = 'Bearer test')",
      "    },",
      "    echo = 'none'",
      "  )",
      "}",
      "options(blockr.chat_function = fake_chat)",
      "",
      "board <- new_dock_board(",
      "  blocks = c(",
      "    data = new_dataset_block('iris'),",
      "    head = new_head_block()",
      "  ),",
      "  links = c(new_link('data', 'head', 'data')),",
      "  extensions = list(assistant = new_assistant_extension()),",
      "  layout = list(list('data', 'head'), 'assistant')",
      ")",
      "",
      "serve(board)"
    ),
    file.path(app_dir, "app.R")
  )

  app <- shinytest2::AppDriver$new(
    app_dir,
    name = "demo",
    seed = 42,
    load_timeout = 30 * 1000
  )
  withr::defer(app$stop())

  panel_html <- app$get_html(".asst-panel")
  expect_true(
    nzchar(panel_html %||% ""),
    info = "the .asst-panel container should be in the DOM"
  )

  chat_html <- app$get_html("shiny-chat-container")
  expect_true(
    nzchar(chat_html %||% ""),
    info = "shinychat's <shiny-chat-container> should be rendered"
  )

  tokens_html <- app$get_html(".asst-token-slot")
  expect_true(
    nzchar(tokens_html %||% ""),
    info = "the token-telemetry slot should be in the DOM"
  )
})
