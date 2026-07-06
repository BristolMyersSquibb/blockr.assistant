# Run the full-stack demo against LOCAL source checkouts (your latest uncommitted
# changes to any blockr package). This is the pkgload::load_all() counterpart of
# the shipped, library()-based inst/examples/full-stack/app.R: it just flips the
# loader and sources it, so the two can never drift.
#
# Run from an R session at the workspace root:
#   source("blockr.assistant/dev/full-stack.R")
#
# (End users without the source checkouts run the shipped copy instead:
#   shiny::runApp(system.file("examples/full-stack", package = "blockr.assistant")))

options(shiny.port = 3838, shiny.host = "0.0.0.0")

dev_local <- TRUE
source("blockr.assistant/inst/examples/full-stack/app.R")
