# Evaluate with an off-screen device open, so that anything the code draws
# comes back as an image. Capture is a property of the device, not of any
# class: base graphics, grid, lattice, a printed ggplot and an auto-printed
# `recordedplot` all land here on the same path, and code that draws nothing
# produces no pages. That is what keeps inspect_results a general-purpose eval
# tool rather than one that special-cases a result shape.
#
# The `%03d` in the filename is what splits pages: the device writes one file
# per completed page, so a loop that draws N times yields N files, in order,
# with no page counting on our side.
capture_drawings <- function(fn, width, height) {

  dir <- tempfile()
  dir.create(dir)

  grDevices::png(file.path(dir, "p%03d.png"), width = width, height = height)
  dev <- grDevices::dev.cur()

  # Close by number, and only if it is still open: model-supplied code is free
  # to open devices of its own, or to close ours.
  value <- tryCatch(
    fn(),
    finally = if (dev %in% grDevices::dev.list()) grDevices::dev.off(dev)
  )

  list(
    value = value,
    dir   = dir,
    files = sort(list.files(dir, full.names = TRUE))
  )
}

# Read the drawn pages as ellmer image content. Sizing is ours, so
# resize = "none" -- which is also what keeps magick off the dependency list,
# since content_image_file() only needs it in order to resize.
drawing_contents <- function(files) {
  lapply(files, ellmer::content_image_file, resize = "none")
}

# Named rather than silent: a call that drew more pages than we return says so,
# instead of reading as everything that was drawn.
dropped_drawings_line <- function(n, max_plots) {

  if (n <= max_plots) {
    return(NULL)
  }

  glue::glue("Returned {max_plots} of {n} drawn plots; the rest are omitted.")
}

# Pinned to baseenv() rather than taken from the board's eval_env(), which
# attaches the default packages or not by its own option. The tool description
# is baked into the system prompt, so a scope that varies per deployment makes
# it either hedged or wrong somewhere; pinned, it states one rule that is
# always true and that the scope hint can then assert. This is the floor
# eval_env() already returns by default, and it grants nothing: prefixed code
# resolves any installed namespace and works in a code block too.
inspect_env <- function(data) {
  list2env(data, parent = baseenv())
}
