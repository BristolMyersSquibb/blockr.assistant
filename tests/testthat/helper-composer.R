# Presence in the DOM is not focusability. A composer sitting in a subtree
# that computes `display: none` stays in the DOM but refuses focus silently,
# so `Input.insertText` dispatches at `<body>`, the text lands nowhere, and
# whatever the caller waits for next times out on a symptom rather than on
# the cause. Focusing from inside the polled predicate is what closes that
# window -- each poll re-attempts the focus and reports whether it stuck, so
# this cannot return until the editor holds it. The chat input is a
# TipTap/ProseMirror contenteditable with no `textarea` to select, so driving
# it from the browser means CDP input events.
type_in_composer <- function(app, text, timeout = 15 * 1000) {

  wait_for_composer(
    app,
    "(() => {
       const el = document.querySelector('.tiptap.ProseMirror');
       if (el === null) return false;
       el.focus();
       return document.activeElement === el;
     })()",
    timeout,
    "composer never took focus"
  )

  app$get_chromote_session()$Input$insertText(text = text)

  wait_for_composer(
    app,
    paste0(
      "document.querySelector('.tiptap.ProseMirror')",
      ".textContent.includes(", encodeString(text, quote = "\""), ")"
    ),
    timeout,
    paste0("composer never received ", encodeString(text, quote = "\""))
  )
}

# A timed-out predicate reports only that it stayed false, and for the focus
# wait above that one message covers several distinct failures: the editor
# missing, the editor present but blanked by the panel's container query, or
# focus landing elsewhere. Two CI runs in #151 could not be told apart from
# the logs for exactly that reason. Sampling the state at timeout is what
# makes the next occurrence name which failure it was, and it costs nothing
# on the green path.
wait_for_composer <- function(app, script, timeout, what) {

  tryCatch(
    app$wait_for_js(script, timeout = timeout),
    error = function(e) {
      stop(
        paste(
          c(
            paste0(what, "\n  state at timeout: ", composer_state(app)),
            composer_log(app),
            paste0("  ", conditionMessage(e))
          ),
          collapse = "\n"
        ),
        call. = FALSE
      )
    }
  )
}

# What the app process itself said. Shinytest2 captures the app's stdout and
# stderr into the driver rather than printing them -- `get_logs()` is the
# documented way back to them -- so a CI log carries none of it unless the
# failure path asks. Filtered to the app's own lines rather than to any one
# message, since the driver's and Chrome's own chatter is not what a failure
# here needs. The drivers run the app at debug level (see `asst_app_driver()`),
# which is what gives this something to say.
composer_log <- function(app, max_lines = 40L) {

  log <- tryCatch(as.data.frame(app$get_logs()), error = function(e) NULL)

  if (is.null(log) || !nrow(log)) {
    return(NULL)
  }

  lines <- log[["message"]][log[["location"]] == "shiny"]

  if (!length(lines)) {
    return(NULL)
  }

  c(
    "  app log:",
    paste0("    ", utils::head(lines, max_lines)),
    if (length(lines) > max_lines) {
      paste0("    (", length(lines) - max_lines, " more lines)")
    }
  )
}

# Whether the container query in `asst_ext_styles()` blanked the slot is the
# one thing a failed wait cannot report on its own, and it can only be
# sampled in the failing window itself -- a panel measured after the wait
# returns is already laid out. Reporting must not itself throw, or the
# diagnostic replaces the failure it was meant to explain.
composer_state <- function(app) {

  tryCatch(
    app$get_js(
      "(() => {
         const show = (el) => el === null ? 'absent' :
           getComputedStyle(el).display + '/' +
           getComputedStyle(el).visibility;
         const panel = document.querySelector('.asst-panel');
         const active = document.activeElement;
         return JSON.stringify({
           viewport: window.innerWidth,
           panelWidth: panel && panel.getBoundingClientRect().width,
           panel: show(panel),
           slot: show(document.querySelector('.asst-chat-slot')),
           editor: show(document.querySelector('.tiptap.ProseMirror')),
           activeTag: active && active.tagName.toLowerCase(),
           activeClass: active && String(active.className)
         });
       })()"
    ),
    error = function(e) paste0("unavailable (", conditionMessage(e), ")")
  )
}
