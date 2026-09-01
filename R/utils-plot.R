# A base-graphics block result is a list of recordings, not a single one:
# block_eval.plot_block() filters the evaluate() log down to its recordedplot
# entries, so the result is an `evaluate_evaluation` holding zero or more of
# them. A bare recording is accepted too, for a block that returns one
# directly.
is_recorded_plot <- function(x) {
  inherits(x, "recordedplot")
}

plot_recordings <- function(x) {

  if (is_recorded_plot(x)) {
    return(list(x))
  }

  if (!is.list(x)) {
    return(list())
  }

  Filter(is_recorded_plot, x)
}

# Replay onto an off-screen PNG. Theming rides along without any work here:
# thematic's hooks fire while the block evaluates, so the display list already
# carries the board's colours -- a themed recording paints its own background
# over whatever the device was opened with -- and replaying reproduces them on
# any device. That is also why core makes the thematic and dark_mode option
# values a block_eval_trigger(): a theme flip re-evaluates the block rather
# than re-rendering the old recording.
render_recordings <- function(x, px = plot_render_px(),
                              max_plots = plot_render_max()) {

  recs <- plot_recordings(x)

  lapply(recs[seq_len(min(length(recs), max_plots))], render_recording, px = px)
}

render_recording <- function(rec, px) {

  file <- tempfile(fileext = ".png")
  on.exit(unlink(file), add = TRUE)

  grDevices::png(file, width = px, height = px)
  dev <- grDevices::dev.cur()

  tryCatch(
    grDevices::replayPlot(rec),
    finally = grDevices::dev.off(dev)
  )

  # Sizing is ours, so resize = "none" -- which is also what keeps magick off
  # the dependency list, since content_image_file() only needs it to resize.
  ellmer::content_image_file(file, resize = "none")
}

# Named rather than silent: a result holding more recordings than we render
# says so, instead of reading as the whole picture.
dropped_plots_line <- function(x, max_plots = plot_render_max()) {

  n <- length(plot_recordings(x))

  if (n <= max_plots) {
    return(NULL)
  }

  glue::glue(
    "Rendered {max_plots} of {n} recorded plots; the rest are omitted."
  )
}
