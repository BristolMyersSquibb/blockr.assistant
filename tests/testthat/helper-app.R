# Chrome's own account of why it never announced its debugging port. The
# launcher writes the browser's stderr to a `tempdir()` scratch file and reads
# it back only on the `!p$is_alive()` branch; the port-open timeout aborts
# without ever touching it, so the one artifact that says what went wrong dies
# with the R session. That is why the CI failure carries no reason. Recover it
# by diffing the scratch dir across the attempt.
#
# The three outcomes separate the candidate causes. No `DevTools listening`
# line at all means Chrome never got that far -- a cold first start, or a
# debugging port it could not bind, which the head of the log names. That line
# present but on another port is the launcher's `output_port != port` mismatch.
# Present on the right port leaves the HTTP probe of `/json/protocol` as what
# actually failed. Startup errors are written first, so report the head.
chrome_stderr <- function(before, n = 20L) {

  logs <- setdiff(
    list.files(tempdir(), pattern = "^chrome-.*-stderr\\.log$",
               full.names = TRUE),
    before
  )

  if (!length(logs)) {
    return("[e2e-chrome] no chrome stderr log for this attempt")
  }

  txt <- readLines(logs[[1L]], warn = FALSE)

  if (!length(txt)) {
    return("[e2e-chrome] chrome stderr is empty -- it announced nothing")
  }

  announced <- grep("^DevTools listening on ws://", txt, value = TRUE)

  paste(
    c(
      sprintf("[e2e-chrome] chrome stderr (%d lines, first %d):", length(txt),
              min(n, length(txt))),
      head(txt, n),
      if (length(announced)) {
        paste("[e2e-chrome] announced:", announced)
      } else {
        "[e2e-chrome] no 'DevTools listening' line was ever written"
      }
    ),
    collapse = "\n"
  )
}

# The chromote package launches the shared browser lazily, inside the first
# `default_chromote_object()`, so a launch that misses the `chromote.timeout`
# window aborts before `AppDriver$new()` is reached and retrying the driver
# never sees it. Retry the launch instead.
#
# A retry is the lever a longer timeout cannot replace, because the abort
# gives up on one port rather than on ten. The launcher picks the debugging
# port through `with_random_port()`, which samples ten and walks them until
# one binds -- but `error_stop_port_search`, the class this failure carries,
# sits in that walk's `stop_on` set, so it is re-signalled at once and the
# other nine are never tried. Re-entering the launch re-samples the port;
# waiting longer only waits on the same one.
#
# Each failure reports Chrome's stderr, since which of the candidate causes it
# was is still unestablished. A timed-out attempt leaves its process running
# (`launch_chrome_impl()` aborts without killing it) and processx only reaps
# it from the `cleanup = TRUE` finalizer, so collect between attempts rather
# than leaking a browser -- and the `$TMPDIR` scratch it holds -- per retry.
retry_chrome_launch <- function(attempts = 3L) {

  pat <- "^chrome-.*-stderr\\.log$"

  for (i in seq_len(attempts)) {

    before <- list.files(tempdir(), pattern = pat, full.names = TRUE)
    res <- tryCatch(chromote::default_chromote_object(), error = function(e) e)

    if (!inherits(res, "error")) {
      return(res)
    }

    message(
      "[e2e-chrome] launch ", i, "/", attempts, " failed: ",
      conditionMessage(res), "\n", chrome_stderr(before)
    )

    gc()
    Sys.sleep(1)
  }

  stop(res)
}

# The dock sizes the assistant rail when the app loads and does not re-flow it
# on a later resize, so the rail's width is decided by whatever viewport the
# browser happened to open with. That default is per-platform, and the macOS
# runner opened narrow enough that the rail's content box fell under the 140px
# container-query threshold: the chat slot was blanked, and the composer inside
# it could not take focus (#151). Measured locally, loading at 600px puts the
# rail at 156px with a 136px content box and blanks the chat, while loading at
# 1600px puts it at 211px. Resizing after load does neither, which is why a
# resize-based probe reports a rail that never narrows. Pinning the viewport is
# what makes the layout the same on every runner.
#
# Every e2e driver goes through here, so the browser launch is hardened in the
# same place as the viewport. The `Page.navigate` command draws its timeout
# from the session's `default_timeout`, inherited from the shared chromote
# object, and chromote's hardcoded 10s default is short for a loaded runner
# binding the app's port (rstudio/shinytest2#448). Raise it on the object
# `retry_chrome_launch()` returns -- the one AppDriver draws its session from.
asst_app_driver <- function(app_dir, ...) {
  chrome <- retry_chrome_launch()
  chrome$default_timeout <- 30
  shinytest2::AppDriver$new(app_dir, ..., width = 1600, height = 1200)
}
