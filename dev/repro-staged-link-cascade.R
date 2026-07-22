# Staged links must not survive the removal of the block they point at.
#
# Before the fix, each case below fails with "Expecting all links to refer to
# known block IDs", and because commit_pending() validates before it writes,
# the removal is a silent no-op: the model cannot retract a block it has just
# wired until it commits.
#
# Run: Rscript dev/repro-staged-link-cascade.R

suppressPackageStartupMessages({
  library(shiny)
  pkgload::load_all(".", quiet = TRUE)
})

board_with <- function() {
  new_board(
    blocks = c(
      data  = new_dataset_block("iris"),
      head  = new_head_block(),
      spare = new_head_block()
    ),
    links = c(l0 = new_link("data", "head", "data"))
  )
}

check <- function(label, fn) {

  pending <- reactiveVal(empty_pending())
  board   <- reactiveValues(board = board_with())

  err <- NULL
  isolate(
    tryCatch(fn(pending, board), error = function(e) err <<- conditionMessage(e))
  )

  cat(sprintf(
    "%-46s %s\n", label,
    if (is.null(err)) "OK" else paste("FAILED:", err)
  ))

  invisible(is.null(err))
}

ok <- c(

  # the block and the link into it are both staged this turn
  check("staged block, staged link into it", function(pending, board) {
    stage_block_add(pending, board, "new", new_head_block())
    stage_link_add(pending, board, "l1", new_link("data", "new", "data"))
    stage_block_rm(pending, board, "new")
  }),

  # the block is already committed, the link into it is staged
  check("committed block, staged link into it", function(pending, board) {
    stage_link_add(pending, board, "l2", new_link("head", "spare", "data"))
    stage_block_rm(pending, board, "spare")
  }),

  # a staged link modification re-points a committed link at the block
  check("committed block, staged link mod at it", function(pending, board) {
    stage_link_mod(pending, board, "l0", list(to = "spare"))
    stage_block_rm(pending, board, "spare")
  }),

  # core already handled this one: committed block, committed links only
  check("committed block, committed link only", function(pending, board) {
    stage_block_rm(pending, board, "head")
  })
)

cat("\n", sum(ok), "/", length(ok), " cases staged cleanly\n", sep = "")
