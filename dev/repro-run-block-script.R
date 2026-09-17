# A block reports that it failed. Which line?
#
# What production showed (2026-09-17): a composer table died with
#
#   incorrect number of arguments to "<-"
#
# and the assistant went round modify -> commit -> get_block_conditions three
# times and gave up. Every round cost a board mutation and returned the same
# sentence. Nothing it could call would say WHICH statement raised, and in that
# case the script was valid R -- the malformed call came out of the block's own
# rewriting of it, so no edit to the script could have helped.
#
# No LLM, no browser. A real board_server, a real failing block, and the
# assistant's own tools.
#
#   Rscript blockr.assistant/dev/repro-run-block-script.R

options(shiny.autoload.r = FALSE, blockr.background_construction_delay = 0)

suppressPackageStartupMessages({
  library(shiny)
  library(blockr.core)
  library(blockr.extra)
})

if (dir.exists("blockr.assistant")) {
  pkgload::load_all("blockr.assistant", helpers = FALSE,
                    attach_testthat = FALSE, quiet = TRUE)
} else {
  library(blockr.assistant)
}

asst <- asNamespace("blockr.assistant")
say  <- function(...) cat(..., "\n", sep = "")
rule <- function(x) say("\n---- ", x, " ", strrep("-", max(0, 58 - nchar(x))))

# Four statements, one of which raises. The first three are fine, so the error
# says nothing about where to look.
script <- paste(
  'keep <- c("Sepal.Length", "Species")',
  '.d <- data[, keep, drop = FALSE]',
  '.d$ratio <- .d$Sepal.Length / .d$Sepal.Width',
  '.d',
  sep = "\n"
)

board <- new_board(
  blocks = c(
    data  = new_dataset_block("iris"),
    demog = new_code_block(script = script)
  ),
  links = c(new_link("data", "demog", "data"))
)

testServer(
  blockr.core:::get_s3_method("board_server", board),
  {
    session$flushReact()
    for (i in 1:5) session$flushReact()

    rule("1. what the block reports")
    cnd <- isolate(rv$conditions())
    if (nrow(cnd)) {
      print(cnd[cnd$block == "demog", c("phase", "severity", "message")])
    } else {
      say("(no conditions row)")
    }
    say("\nThat is the whole signal. Four statements, no line, no text.")

    rule("2. run_block_script: the statement that raised")
    tool <- asst$tool_run_block_script(rv, function(...) NULL, session)
    say(tool(id = "demog"))

    rule("3. trying a fix, without touching the board")
    fixed <- paste(
      'keep <- c("Sepal.Length", "Sepal.Width", "Species")',
      '.d <- data[, keep, drop = FALSE]',
      '.d$ratio <- .d$Sepal.Length / .d$Sepal.Width',
      '.d',
      sep = "\n"
    )
    say(tool(id = "demog", code = fixed))
  },
  args = list(
    x = board,
    plugins = list(),
    callbacks = function(visibility, ...) {
      for (id in c("data", "demog")) {
        visibility$required[[id]](TRUE)
        visibility$visible[[id]](TRUE)
      }
    }
  )
)
