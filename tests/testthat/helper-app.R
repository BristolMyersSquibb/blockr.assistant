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

# Chat is blanked below a 140px container query, so an e2e driver opening
# narrow enough to squeeze the assistant's rail gets a composer that cannot
# take focus (#151). Pinning the width here keeps every runner on one layout.
#
# The diagnosis that pin originally shipped on was wrong, and is worth not
# repeating: the rail was thought to follow whatever viewport the browser
# happened to open with. What actually ground it down was dockview laying the
# shell out from a grid the ResizeObserver had not yet seeded, so a restore
# that won the race sized the rail against a 100x100 default and nothing
# re-flowed it -- fixed upstream in cynkra/dockViewR#116. Whether the pin still
# carries weight has not been measured since.
#
# Every e2e driver goes through here, so the browser launch is hardened in the
# same place as the viewport. The `Page.navigate` command draws its timeout
# from the session's `default_timeout`, inherited from the shared chromote
# object, and chromote's hardcoded 10s default is short for a loaded runner
# binding the app's port (rstudio/shinytest2#448). Raise it on the object
# `retry_chrome_launch()` returns -- the one AppDriver draws its session from.
#
# Debug logging is on for every e2e app so that the app log `composer_log()`
# attaches to a failed composer wait has something to report. It is read only
# on failure, so a green run pays nothing for it, and for a failure that shows
# up on a CI runner alone it is the only record of what the app did. A caller's
# own options win, so a test injecting one (the dead chat function) keeps it.
asst_app_driver <- function(app_dir, ..., options = list()) {
  chrome <- retry_chrome_launch()
  chrome$default_timeout <- 30
  shinytest2::AppDriver$new(
    app_dir, ...,
    width = 1600, height = 1200,
    options = modifyList(list(blockr.log_level = "debug"), options)
  )
}
