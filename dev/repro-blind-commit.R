# A broken block reports clean to the assistant.
#
# What production showed: the assistant was asked for a demographics table, it
# edited a code block sitting on a tab the user was not looking at, committed,
# read the commit back, saw nothing wrong and said it was done. The user opened
# the tab and the block was red:
#
#   unused argument (c("ASIAN", "BLACK OR AFRICAN AMERICAN", ...))
#
# No LLM here, no browser, and nothing about composer -- the failure is not
# about what the model wrote. A real board_server, a real off-screen block, and
# the assistant's own post-commit review code.
#
#   Rscript blockr.assistant/dev/repro-blind-commit.R

options(shiny.autoload.r = FALSE, blockr.background_construction_delay = 0)

suppressPackageStartupMessages({
  library(shiny)
  library(blockr.core)
  library(blockr.extra)
})

# Run against the working tree when it is visible, so this reports what the
# checkout does rather than what happens to be installed.
if (dir.exists("blockr.assistant")) {
  pkgload::load_all("blockr.assistant", helpers = FALSE,
                    attach_testthat = FALSE, quiet = TRUE)
} else {
  library(blockr.assistant)
}

asst <- asNamespace("blockr.assistant")

say  <- function(...) cat(..., "\n", sep = "")
rule <- function(x) say("\n---- ", x, " ", strrep("-", max(0, 58 - nchar(x))))

# The block the model wrote. It parses, so it constructs; it raises when it
# runs, like a composer call handed an argument it has no formal for.
script <- paste(
  '.demog <- function(d, vars) d[, vars, drop = FALSE]',
  '',
  'vars <- factor(c("Sepal.Length", "Species"),',
  '               levels = c("Sepal.Length", "Sepal.Width", "Species"))',
  '',
  '.demog(data, as.character(vars), c("ASIAN", "WHITE"))',
  sep = "\n"
)

board <- new_board(
  blocks = c(
    data  = new_dataset_block("iris"),
    demog = new_code_block(script = script)
  ),
  links = c(new_link("data", "demog", "data"))
)

# The assistant's flush_review() (R/ext-server.R), spelled out: the conditions
# it armed the commit with, the conditions after, and the touched results.
review <- function(rv, baseline, touched, results = TRUE) {

  out <- asst$format_flush_feedback(
    list(ok = TRUE),
    asst$added_conditions(baseline, isolate(rv$conditions())),
    if (results) asst$collect_touched_results(touched, rv, character()),
    header = asst$commit_header()
  )

  if (is.null(out)) asst$commit_clean_note() else out
}

testServer(
  blockr.core:::get_s3_method("board_server", board),
  {
    session$flushReact()
    baseline <- isolate(rv$conditions())

    rule("1. the board as the user left it")
    say("`demog` is on a tab nobody is looking at.")
    say("eval status: ", asst$eval_status("demog", rv))
    say("conditions rows: ", nrow(baseline))

    rule("2. the review the commit used to take, one flush after the update")
    say(review(rv, baseline, "demog", results = FALSE))
    say("\n(and this is all the results section had to say about `demog`:)")
    say(asst$block_result_summary("demog", rv))

    rule("3. what the fix does")
    # A `sustain` claim over the touched blocks, held across the read-back:
    # core keeps a claimed block in the eval set until its owner lets go, so
    # the block runs while still off screen (see the Evaluation requests
    # section of ?board_server). This is what the commit payload now carries.
    #
    # `sustain`, not `evaluate`: `evaluate` is a one-off core drops the moment
    # the block has run, so the block is `dormant` again by the time the review
    # reads it -- the error survives, the result does not.
    board_update(list(sustain = list(blockr.assistant = list(set = "demog"))))
    for (i in 1:8) session$flushReact()

    say("eval status under the claim: ", asst$eval_status("demog", rv))
    say(review(rv, baseline, "demog"))

    rule("4. and this is what the user sees on opening the tab")
    vis$required[["demog"]](TRUE)
    vis$visible[["demog"]](TRUE)
    session$flushReact()

    say("eval status: ", asst$eval_status("demog", rv))
    cnd <- isolate(rv$conditions())
    print(cnd[, c("block", "phase", "severity", "message")])
  },
  args = list(
    x = board,
    plugins = list(),
    callbacks = function(visibility, ...) {
      # One panel on screen. This is what a dock view does.
      visibility$required[["data"]](TRUE)
      visibility$visible[["data"]](TRUE)
    }
  )
)
