# A dock board with the agent access extension and the clinical block set, on
# the first free forwarded port.
#
# Everything the outside harness needs is in THIS package: the tool session the
# chat panel also uses, the per-session endpoint, the registry a board
# announces itself in, and the MCP facade under inst/facade.
#
# Run from the package root:
#
#   Rscript dev/run-app.R > /tmp/agent-app.log 2>&1 &
#
# Then open the printed URL. The Agent panel shows the connection string, and
# the board announces itself in the registry either way, so the facade finds it
# without being told.

pkgload::load_all(".", quiet = TRUE)

library(blockr.core)
library(blockr.dplyr)
# Clinical blocks, so an agent can build a demographics overview: summary
# tables and charts from blockr.pharma / blockr.viz, ADSL from pharmaverseadam.
library(blockr.viz)
library(blockr.pharma)   # ADaM-shaped blocks, ADSL from pharmaverseadam
library(blockr.extra)
library(blockr.dm)
library(blockr.ggplot)

# A deployment usually loads more than this: its own block packages, and its
# own skills. Both change what an agent builds, and the skills change it a
# lot -- with none, it reaches for raw blocks; with house conventions, it
# reaches for the block the convention names.
skills <- Sys.getenv("BLOCKR_ASSISTANT_SKILLS")

options(
  blockr.tabular_display = blockr.ui::html_table_display,
  # Deployment-authored guidance the tool kit advertises and `read_skill`
  # serves. Unset means the agent gets the tools and no house conventions.
  blockr.assistant_skills = if (nzchar(skills)) skills
)

board <- blockr.dock::new_dock_board(
  blocks = list(
    adsl = new_dataset_block("adsl", package = "pharmaverseadam",
                             block_name = "ADSL")
  ),
  extensions = list(
    dag   = blockr.dag::new_dag_extension(),
    agent = new_agent_access_extension()
  )
)

# Hide the authoring chrome the way a read-only deployment does: gears, section
# toggles, tab close buttons, the board-options accordion. It refuses nothing,
# so the agent's tools are unaffected; it only stops offering the controls to
# the reader. Set BLOCKR_SIMPLIFIED=false to author in this app.
#
# INERT in this container as it stands: simplified mode lives on an unmerged
# blockr.dock branch, and the installed 0.1.5 has no `simplified` flag, so the
# gears stay on screen. Install that branch to see it take effect.
if (!nzchar(Sys.getenv("BLOCKR_SIMPLIFIED"))) {
  Sys.setenv(BLOCKR_SIMPLIFIED = "true")
}

port <- if (exists("blockr_port")) blockr_port() else 3838L
message("app: http://127.0.0.1:", port, "/")
shiny::runApp(serve(board), port = port, host = "0.0.0.0")
