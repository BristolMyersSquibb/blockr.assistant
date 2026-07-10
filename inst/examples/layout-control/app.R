# A two-view board ("Workbench" + "Chart") for exercising the
# layout-control tools through the assistant.

library(blockr.core)
library(blockr.dock)
library(blockr.assistant)

board <- new_dock_board(
  blocks = c(
    data = new_dataset_block("iris"),
    filt = new_subset_block(subset = "Sepal.Length > 5"),
    head = new_head_block(n = 10L),
    plot = new_scatter_block(x = "Sepal.Length", y = "Sepal.Width")
  ),
  links = c(
    new_link("data", "filt", "data"),
    new_link("filt", "head", "data"),
    new_link("filt", "plot", "data")
  ),
  extensions = list(assistant = new_assistant_extension()),
  views = list(
    Workbench = list(blk("data"), blk("filt"), blk("head"), ext("assistant")),
    Chart = "plot"
  ),
  grids = list(
    Workbench = dock_grid(
      group(blk("data"), blk("filt"), blk("head")),
      ext("assistant"),
      sizes = c(0.6, 0.4)
    )
  )
)

serve(board)
