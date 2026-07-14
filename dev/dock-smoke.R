# Assistant-in-the-dock smoke test (source packages, monorepo layout).
#
# Run from the workspace root:
#   Rscript blockr.assistant/dev/dock-smoke.R [port]
# (or from the branch worktree: Rscript _scratch/assistant-main/dev/dock-smoke.R)
# Port: positional arg, else BLOCKR_PORT, else 3838.
# Needs OPENAI_API_KEY (picked up from the workspace-root .Renviron).
# Loads the blockr.assistant TREE THIS SCRIPT LIVES IN, so running the
# worktree copy tests the worktree's branch, not the main checkout.
#
# Try, in the Assistant view:
#   'add a filter block named "Setosa filter" that keeps only setosa rows,
#    linked from the data block'
# The staged add_block/add_link flush at turn end; the new block opens in
# its own dock panel. The Workflow view shows the DAG.

port <- suppressWarnings(as.integer(commandArgs(trailingOnly = TRUE)[1]))
if (is.na(port)) port <- as.integer(Sys.getenv("BLOCKR_PORT", "3838"))
options(shiny.port = port, shiny.host = "127.0.0.1")

options(blockr.chat_function = list(
  "gpt-5.1" = function(system_prompt = NULL, params = NULL) {
    ellmer::chat_openai(model = "gpt-5.1", system_prompt = system_prompt)
  }
))

# blockr.dock@main does not evaluate blocks against blockr.core@main (the
# on-screen contract mismatch); prefer the 304-defer-offscreen-docks
# worktree when present.
dock_path <- if (dir.exists("_scratch/dock-304")) "_scratch/dock-304" else "blockr.dock"
for (p in c("blockr.core", dock_path, "blockr.dag", "blockr.dplyr")) {
  pkgload::load_all(p, quiet = TRUE)
}
script <- sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE)[1])
pkg_dir <- dirname(dirname(normalizePath(script)))
pkgload::load_all(pkg_dir, quiet = TRUE)

serve(
  new_dock_board(
    blocks = c(data = new_dataset_block("iris")),
    extensions = list(
      assistant = new_assistant_extension(),
      dag = blockr.dag::new_dag_extension()
    ),
    grids = list(
      Assistant = dock_grid(ext("assistant")),
      Workflow = dock_grid(ext("dag"))
    ),
    active = "Assistant"
  )
)
