# Mimic block_eval.plot_block(): evaluate code and keep the recorded plots, so
# a test result has the exact shape a plot block hands the assistant -- an
# `evaluate_evaluation` holding zero or more `recordedplot` entries.
record_plots <- function(code) {

  res <- evaluate::evaluate(code, new.env(parent = globalenv()))

  Filter(function(x) inherits(x, "recordedplot"), res)
}

# Decode the base64 the model would actually receive and read the PNG header,
# so a test can assert the image is real and correctly sized rather than that
# an object of the right class came back. No new dependency: jsonlite is
# already imported, and IHDR sits at a fixed offset in every PNG.
png_header <- function(content) {

  raw <- jsonlite::base64_dec(content@data)

  be32 <- function(i) as.integer(sum(as.integer(raw[i:(i + 3L)]) * 256^(3:0)))

  list(
    signature = identical(
      as.integer(raw[1:8]),
      c(137L, 80L, 78L, 71L, 13L, 10L, 26L, 10L)
    ),
    ihdr   = rawToChar(raw[13:16]),
    width  = be32(17L),
    height = be32(21L)
  )
}
