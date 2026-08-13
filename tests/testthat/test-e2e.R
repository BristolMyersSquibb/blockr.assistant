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

  # The container reaches the DOM a beat before either thing the keystroke
  # needs: the composer, which React mounts once the custom element upgrades,
  # and the commands, advertised to that element in a one-shot message a flush
  # later. Typing into that window cannot be recovered by waiting longer -- the
  # text lands nowhere without a composer, and nothing reopens the palette when
  # a late advertisement arrives. The `aria-haspopup` attribute shinychat sets
  # on the composer is there exactly while it holds a command, so this one wait
  # closes both windows, and asserts the whole seam -- the scan, the
  # registration, and its timing against the flush carrying the element's UI --
  # before a key is pressed.
  app$wait_for_js(
    "document.querySelector('.ProseMirror[aria-haspopup=listbox]') !== null",
    timeout = 20 * 1000
  )

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

test_that("a rejected turn surfaces the error and releases the chat", {

  skip_on_cran()
  skip_if_not_installed("shinytest2")
  skip_if_not_installed("chromote")

  chromote_obj <- chromote::default_chromote_object()
  chromote_obj$default_timeout <- 30

  # Nothing listens on port 1, so the provider refuses the turn before it
  # streams anything -- the shape a quota or context-length rejection
  # arrives in. Injected as an option rather than baked into a fixture app,
  # so the shipped example carries no deliberately broken provider.
  app <- shinytest2::AppDriver$new(
    system.file("examples", "empty-board", package = "blockr.assistant"),
    name = "stream-failure",
    seed = 42,
    load_timeout = 30 * 1000,
    options = list(blockr.chat_function = dead_chat_function)
  )
  withr::defer(app$stop())

  app$wait_for_js(
    "document.querySelector('.shiny-chat-btn-send') !== null",
    timeout = 15 * 1000
  )

  chrome <- app$get_chromote_session()
  chrome$Runtime$evaluate(
    "document.querySelector('.tiptap.ProseMirror').focus()"
  )
  chrome$Input$insertText(text = "load the iris data")

  app$wait_for_js(
    "!document.querySelector('.shiny-chat-btn-send').disabled",
    timeout = 10 * 1000
  )
  app$run_js("document.querySelector('.shiny-chat-btn-send').click()")

  app$wait_for_js(
    paste0(
      "document.querySelector('.shiny-chat-message ",
      ".shiny-chat-message-content')?.innerText.trim().length > 0"
    ),
    timeout = 30 * 1000
  )

  reply <- app$get_js(
    paste0(
      "document.querySelector('.shiny-chat-message ",
      ".shiny-chat-message-content').innerText"
    )
  )

  # Should this ever fail with shinychat's own wording ("An error
  # occurred:") in the first bubble, posit-dev/shinychat#304 has landed and
  # is rendering the error before we do -- leaving the user with the same
  # message twice. Delete our workaround; do not repair this assertion.
  expect_match(reply, "could not complete this turn", fixed = TRUE)

  # The spinner and the locked composer are the same client-side state: a
  # turn that never finishes leaves both up for good.
  expect_false(
    app$get_js(
      "document.querySelector('.shiny-chat-input')
         .classList.contains('disabled')"
    )
  )

  # A slash command streams outside shinychat's task, so the same rejection
  # arrives at our own `append()` call as a plain error instead of a task
  # status. Fired through the input the browser would set, to keep the
  # command palette's keyboard handling out of it.
  app$run_js(
    "const id = document.querySelector('shiny-chat-container').id;
     Shiny.setInputValue(
       id + '_slash_command',
       {command: 'layout', userText: ''},
       {priority: 'event'}
     );"
  )

  app$wait_for_js(
    "document.querySelectorAll('.shiny-chat-message')[1]
       ?.innerText.trim().length > 0",
    timeout = 30 * 1000
  )

  replies <- app$get_js(
    "Array.from(document.querySelectorAll('.shiny-chat-message'))
       .map(m => m.innerText)"
  )

  expect_match(replies[[2]], "could not complete this turn", fixed = TRUE)
})
