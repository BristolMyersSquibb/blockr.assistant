# The same pipeline as `run-focus-prototype.R`, with the demo scatter block
# swapped for a ggplot block.
#
# Why a second script: blockr.core's scatter block is a demonstration block and
# declares no external control (`external_ctrl_vars()` is `"block_name"` only),
# so `modify_block` cannot touch its axes and "switch axes" gets a refusal no
# matter how well the selection is scoped. The ggplot block declares 14
# controllable arguments, so the same request goes through. This is the board
# to try scoped editing on; the packaged example stays as it is, with no
# blockr.ggplot dependency.

workspace <- Sys.getenv(
  "BLOCKR_WORKSPACE",
  unset = normalizePath("..", mustWork = FALSE)
)

renviron <- file.path(workspace, ".Renviron")

if (file.exists(renviron)) {
  readRenviron(renviron)
}

for (pkg in c("blockr.core", "blockr.dock", "blockr.ggplot",
              "blockr.assistant")) {
  pkgload::load_all(file.path(workspace, pkg), quiet = TRUE)
}

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris"),
    filt = new_subset_block(subset = "Sepal.Length > 5"),
    head = new_head_block(n = 10L),
    plot = new_ggplot_block(
      type = "point", x = "Sepal.Length", y = "Sepal.Width"
    )
  ),
  links = c(
    new_link("data", "filt", "data"),
    new_link("filt", "head", "data"),
    new_link("filt", "plot", "data")
  ),
  extensions = list(assistant = new_assistant_extension())
)

port <- blockr_port()

message("Serving on http://127.0.0.1:", port, "/")

shiny::runApp(serve(board), port = port, host = "0.0.0.0",
              launch.browser = FALSE)
