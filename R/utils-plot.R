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
