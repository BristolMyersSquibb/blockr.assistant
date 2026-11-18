# What the end-to-end tests use (test-end-to-end.R).
# They drive Chrome through shinytest2, as the end-to-end tests of blockr.core
# and blockr.dock do, and act on the assistant's chat as a user does.
# They read what core gives end-to-end tests: the board and each block's
# status, through `blockrTest` on the page, and each block's latest result,
# which R exports.

# The id of the assistant's plugin class, under which the board holds the
# assistant's state.
assistant_class <- "blockr.assistant-assistant_plugin"

# The JS that finds the chat on the page.
chat_js <- "document.querySelector('.blockr-assistant-chat')"

# Starts an example app from `inst/examples`, by its name, with shinytest2, and
# stops it as the test ends.
# The app's R process gets the R options given, such as the blockr options of
# a deployment whose calls go to the mock (`mock_deployment()`).
# The window is 1400 pixels wide and 900 high.
# It waits until the client has opened the board, and the chat has drawn its
# message field (`wait_for_chat()`).
local_example_app <- function(name, options, frame = parent.frame()) {

  testthat::skip_on_cran()
  testthat::skip_if_not_installed("shinytest2")

  chrome <- try(chromote::default_chromote_object(), silent = TRUE)
  testthat::skip_if(inherits(chrome, "try-error"), "Chrome does not start.")

  app <- shinytest2::AppDriver$new(
    system.file("examples", name, "app.R", package = "blockr.assistant"),
    options = options,
    load_timeout = 30 * 1000,
    timeout = 30 * 1000,
    width = 1400,
    height = 900
  )

  withr::defer(app$stop(), envir = frame)

  wait_for_chat(app)

  app
}

# Waits until the client has opened the board, and the chat has drawn its
# message field.
# It first has the frontend show the assistant's panel, through `blockrTest`.
# A frontend may show another panel in front of it, as the dock's rail may
# show the panel of core's Edit board plugin.
wait_for_chat <- function(app) {

  app$wait_for_js(
    "window.blockrTest !== undefined && blockrTest.board() !== null"
  )

  app$get_js(paste0("blockrTest.show({ plugin: '", assistant_class, "' })"))

  app$wait_for_js(
    paste0(chat_js, "?.querySelector('textarea[aria-label=Message]') != null")
  )

  invisible(app)
}

# The board that the client holds, as the page gives it.
app_board <- function(app) {
  app$get_js("blockrTest.board()")
}

# The status of each of the board's blocks, by block id, as the page gives it.
app_statuses <- function(app) {
  app$get_js("blockrTest.statuses()")
}

# Each block's latest result, as R exports it.
app_results <- function(app) {
  app$get_values(export = "result")$export$result
}

# The conversations that the assistant's state holds, by id.
app_conversations <- function(app) {
  app_board(app)[["plugins"]][[assistant_class]][["conversations"]]
}

# Who each message of a conversation is from, in order.
message_roles <- function(conversation) {
  chr_xtr(conversation[["messages"]], "role")
}

# The text of a message, its text parts joined.
message_text <- function(message) {
  texts <- Filter(
    function(part) identical(part[["type"]], "text"),
    message[["parts"]]
  )
  paste(chr_xtr(texts, "text"), collapse = "")
}

# The text that the chat shows.
chat_text <- function(app) {
  app$get_js(paste0(chat_js, ".innerText"))
}

# The JS that finds the chat's button of the label given.
chat_button_js <- function(label) {
  paste0(chat_js, ".querySelector('button[aria-label=\"", label, "\"]')")
}

# Whether the chat shows the button of the label given.
chat_has_button <- function(app, label) {
  app$get_js(paste0(chat_button_js(label), " != null"))
}

# Clicks the chat's button of the label given, once it shows and is enabled.
click_chat_button <- function(app, label) {

  button <- chat_button_js(label)

  app$wait_for_js(paste0("!(", button, "?.disabled ?? true)"))
  app$run_js(paste0(button, ".click()"))

  invisible(app)
}

# Types the text into the chat's message field, as a user types it, and sends
# it with the send button.
send_message <- function(app, text) {

  app$run_js(
    paste0(chat_js, ".querySelector('textarea[aria-label=Message]').focus()")
  )
  app$get_chromote_session()$Input$insertText(text = text)

  click_chat_button(app, "Send")
}

# Waits until `check()` gives `TRUE`, and fails with what `what()` says once
# `timeout` seconds have passed.
wait_until <- function(check, what, timeout = 30) {

  deadline <- Sys.time() + timeout

  repeat {

    if (isTRUE(check())) {
      return(invisible())
    }

    if (Sys.time() > deadline) {
      stop("Waited ", timeout, " seconds for ", what(), call. = FALSE)
    }

    Sys.sleep(0.1)
  }
}

# Waits until the chat shows the text given.
wait_for_chat_text <- function(app, text) {
  wait_until(
    function() grepl(text, chat_text(app), fixed = TRUE),
    function() {
      paste0("the chat to show \"", text, "\", where it shows:\n",
             chat_text(app))
    }
  )
}

# Waits until the turn ends with the reply given: the board's only
# conversation ends with the model's message of that text, and the chat
# offers to send again.
# It gives the conversation.
wait_for_reply <- function(app, text) {

  conversation <- NULL

  wait_until(
    function() {
      conversations <- app_conversations(app)
      if (length(conversations) != 1L) {
        return(FALSE)
      }
      conversation <<- conversations[[1L]]
      last <- conversation[["messages"]][[length(conversation[["messages"]])]]
      identical(last[["role"]], "assistant") &&
        identical(message_text(last), text) &&
        chat_has_button(app, "Send")
    },
    function() {
      paste0(
        "the reply \"", text, "\", where the conversations are:\n",
        jsonlite::toJSON(app_conversations(app), auto_unbox = TRUE)
      )
    }
  )

  conversation
}

# Waits until the block of the id given reads the status given, and R runs no
# evaluation of it.
wait_for_status <- function(app, id, status) {
  wait_until(
    function() {
      got <- app_statuses(app)[[id]]
      identical(got[["status"]], status) && isFALSE(got[["running"]])
    },
    function() {
      paste0(
        "the block ", id, " to read ", status, ", where it reads ",
        coal(app_statuses(app)[[id]][["status"]], "no status")
      )
    }
  )
}

# Clicks the button on the page whose text is the one given, such as the
# storage control "Save", as a user does.
# The click counts as the user's gesture, which a download and a file picker
# need.
click_page_button <- function(app, text) {

  button <- paste0(
    "[...document.querySelectorAll('button')]",
    ".find((b) => b.textContent.trim() === '", text, "')"
  )

  app$wait_for_js(paste0(button, " !== undefined"))
  app$get_chromote_session()$Runtime$evaluate(
    paste0(button, ".click()"),
    userGesture = TRUE
  )

  invisible(app)
}

# Saves the board with the Save button of the app's storage plugin, and gives
# the path of the file that the browser downloads to the directory given.
save_board <- function(app, dir) {

  session <- app$get_chromote_session()
  session$parent$Browser$setDownloadBehavior(
    behavior = "allow",
    downloadPath = normalizePath(dir)
  )

  click_page_button(app, "Save")

  saved <- function() {
    list.files(dir, pattern = "[.]json$", full.names = TRUE)
  }

  wait_until(
    function() length(saved()) == 1L,
    function() paste0("the board's file in ", dir)
  )

  saved()
}

# Opens the board of the file given with the Open button of the app's storage
# plugin, as a user picks the file in the browser's file picker.
# The browser hands the picker to the test, which gives it the file.
open_board <- function(app, file) {

  session <- app$get_chromote_session()
  session$Page$setInterceptFileChooserDialog(enabled = TRUE)
  withr::defer(session$Page$setInterceptFileChooserDialog(enabled = FALSE))

  picked <- FALSE
  stop_listening <- session$Page$fileChooserOpened(
    callback_ = function(event) {
      session$DOM$setFileInputFiles(
        files = list(normalizePath(file)),
        backendNodeId = event$backendNodeId
      )
      picked <<- TRUE
    }
  )
  withr::defer(stop_listening())

  click_page_button(app, "Open")

  # Chrome calls back as it handles the page's next message.
  wait_until(
    function() {
      app$get_js("true")
      picked
    },
    function() "the browser to open its file picker"
  )

  invisible(app)
}

# Reloads the page, which starts a new session of the app, and waits until the
# chat draws again.
reload_page <- function(app) {

  page <- app$get_chromote_session()

  loaded <- page$Page$loadEventFired(wait_ = FALSE)
  page$Page$reload(wait_ = FALSE)
  page$wait_for(loaded)

  wait_for_chat(app)
}
