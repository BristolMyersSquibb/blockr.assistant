# Mimic block_eval.plot_block(): evaluate code and keep the recorded plots, so
# a test result has the exact shape a plot block hands the assistant -- an
# `evaluate_evaluation` holding zero or more `recordedplot` entries.
record_plots <- function(code) {

  res <- evaluate::evaluate(code, new.env(parent = globalenv()))

  Filter(function(x) inherits(x, "recordedplot"), res)
}
