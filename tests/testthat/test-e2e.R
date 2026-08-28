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

  app$wait_for_js(
    "document.querySelector('.asst-focus-slot select') !== null &&
     document.querySelector('.asst-focus-slot select').selectize !== undefined",
    timeout = 15 * 1000
  )

  slots <- unlst(
    app$get_js(
      "Array.from(document.querySelector('.asst-footer').children)
         .map(function(el) { return el.className; })"
    )
  )

  expect_length(slots, 3L)
  expect_match(slots[[1L]], "asst-focus-slot")
  expect_match(slots[[2L]], "asst-token-slot")
  expect_match(slots[[3L]], "asst-history-btn")

  # The seam no unit test reaches: the footer button is ours, the drawer it
  # opens is shinychat's, and the click crosses into a React handler bound at
  # the `shiny-chat-container` root.
  expect_equal(
    unlst(
      app$get_js(
        "getComputedStyle(
           document.querySelector('.shiny-chat-history-trigger')
         ).display"
      )
    ),
    "none"
  )

  app$run_js("document.querySelector('.asst-history-btn').click()")

  app$wait_for_js(
    "document.querySelector('.shiny-chat-history') !== null",
    timeout = 10 * 1000
  )

  expect_true(
    unlst(
      app$get_js(
        "document.querySelector('.shiny-chat-history-trigger')
           .getAttribute('aria-expanded') === 'true'"
      )
    )
  )

  picker <- "document.querySelector('.asst-focus-slot select').selectize"

  expect_setequal(
    unlst(app$get_js(paste0("Object.keys(", picker, ".options)"))),
    c("data", "head")
  )
  expect_null(app$get_js(paste0(picker, ".settings.maxItems")))

  # Without dropdownParent the menu is clipped by the panel it opens inside.
  expect_identical(
    app$get_js(paste0(picker, ".$dropdown.parent()[0].tagName")),
    "BODY"
  )

  # Short enough that the menu cannot fit below a picker pinned to the
  # bottom of the panel, so opening it has to lift it over the transcript.
  app$set_window_size(width = 1200, height = 700)
  app$run_js(paste0(picker, ".open();"))

  visible <- paste0(
    "(function() {
       var menu = ", picker, ".$dropdown[0];
       if (menu.offsetHeight === 0) return false;
       var box = menu.getBoundingClientRect();
       return box.top >= 0 && box.bottom <= window.innerHeight;
     })()"
  )

  app$wait_for_js(visible, timeout = 10 * 1000)
  expect_true(app$get_js(visible))
})

test_that("the browser's command palette lists built-ins and skills", {

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

  # A bare slash filters nothing, so one palette read covers both what the
  # skill scan found and the built-ins registered ahead of it.
  type_in_composer(app, "/")

  app$wait_for_js(
    "document.querySelector('.shiny-chat-slash-palette') !== null",
    timeout = 10 * 1000
  )

  palette <- app$get_js(
    "document.querySelector('.shiny-chat-slash-palette').innerText"
  )

  expect_match(palette, "exposure-check", fixed = TRUE)
  expect_match(palette, "/compact", fixed = TRUE)
  # Dropping `/clear` is deliberate: it leaves the stored thread for the next
  # response to extend, and nothing in shinychat's server API opens a fresh
  # conversation to replace it. Starting a thread is the drawer's job.
  expect_no_match(palette, "/clear", fixed = TRUE)
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

  type_in_composer(app, "load the iris data")

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

  expect_match(reply, "An error occurred:", fixed = TRUE)

  # The spinner and the locked composer are the same client-side state: a
  # turn that never finishes leaves both up for good.
  expect_false(
    app$get_js(
      "document.querySelector('.shiny-chat-input')
         .classList.contains('disabled')"
    )
  )

  # A slash command streams outside shinychat's task, reaching the same
  # reporting through our own `append()` call. Fired through the input the
  # browser would set, to keep the command palette's keyboard handling out
  # of it.
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

  expect_match(replies[[2]], "An error occurred:", fixed = TRUE)
})
