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
      "  views = list(Main = list(blk('data'), blk('head'), ext('assistant')))",
      ")",
      "",
      "serve(board)"
    ),
    file.path(app_dir, "app.R")
  )

  # Page.navigate uses chromote's per-command timeout, a hardcoded 10s
  # (ChromoteSession$default_timeout) that the chromote.timeout launch option
  # does not cover. A loaded Windows runner can take longer to acknowledge the
  # navigate, so raise it on the shared browser shinytest2 reuses.
  chromote_obj <- chromote::default_chromote_object()
  chromote_obj$default_timeout <- 30

  app <- shinytest2::AppDriver$new(
    app_dir,
    name = "demo",
    seed = 42,
    load_timeout = 30 * 1000
  )
  withr::defer(app$stop())

  # The chat panel mounts via a deferred reactive cascade (build client ->
  # mount_idx -> renderUI), which can land a flush or two after the initial
  # load idle. Wait for shinychat's element before asserting on it.
  app$wait_for_js(
    "document.querySelector('shiny-chat-container') !== null",
    timeout = 15 * 1000
  )

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

test_that("a user-invocable skill reaches the browser's command palette", {

  skip_on_cran()
  skip_if_not_installed("shinytest2")
  skip_if_not_installed("chromote")

  app_dir <- withr::local_tempdir()

  write_skill(
    file.path(app_dir, "skills"), "exposure-check",
    c(
      "name: exposure-check",
      "description: Check a dataset before analysing it.",
      "user-invocable: true"
    )
  )

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
      "options(",
      "  blockr.chat_function = fake_chat,",
      "  blockr.assistant_skills = normalizePath('skills')",
      ")",
      "",
      "board <- new_dock_board(",
      "  blocks = c(data = new_dataset_block('iris')),",
      "  extensions = list(assistant = new_assistant_extension()),",
      "  views = list(Main = list(blk('data'), ext('assistant')))",
      ")",
      "",
      "serve(board)"
    ),
    file.path(app_dir, "app.R")
  )

  chromote_obj <- chromote::default_chromote_object()
  chromote_obj$default_timeout <- 30

  app <- shinytest2::AppDriver$new(
    app_dir,
    name = "skills",
    seed = 42,
    load_timeout = 30 * 1000
  )
  withr::defer(app$stop())

  app$wait_for_js(
    "document.querySelector('shiny-chat-container') !== null",
    timeout = 15 * 1000
  )

  # The commands are advertised to the chat element in a one-shot message, so
  # this asserts the whole seam: the scan, the registration, and its timing
  # against the flush that carries the element's UI.
  chrome <- app$get_chromote_session()
  chrome$Runtime$evaluate(
    "document.querySelector('.tiptap.ProseMirror').focus()"
  )
  chrome$Input$insertText(text = "/exp")

  app$wait_for_js(
    "document.querySelector('.shiny-chat-slash-palette') !== null",
    timeout = 10 * 1000
  )

  palette <- app$get_js(
    "document.querySelector('.shiny-chat-slash-palette').innerText"
  )

  expect_match(palette, "exposure-check", fixed = TRUE)
})
