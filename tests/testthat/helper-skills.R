write_skill <- function(root, dir, frontmatter, body = "Body text.") {

  path <- file.path(root, dir)
  dir.create(path, recursive = TRUE, showWarnings = FALSE)

  writeLines(
    c("---", frontmatter, "---", "", body),
    file.path(path, "SKILL.md")
  )

  path
}

# Catch what blockr.core logs while `expr` runs, as one string.
# With the blockr option `logger` at "condition", core signals each line as a
# message, or as a warning where the line is a warning or an error.
# Core works out its logger once and keeps it, so `reset_logging()` runs
# before `expr`, and again after it, so that the next test finds no logger
# left behind.
# Core puts the level and the package in front of each line and wraps the
# line to the console's width, so both are undone.
capture_logs <- function(expr) {

  logs <- character()

  withr::local_options(
    blockr.logger = "condition",
    blockr.log_level = "debug",
    blockr.log_time = FALSE
  )

  blockr.core::reset_logging()
  withr::defer(blockr.core::reset_logging())

  withCallingHandlers(
    expr,
    message = function(cnd) {
      logs <<- c(logs, conditionMessage(cnd))
      invokeRestart("muffleMessage")
    },
    warning = function(cnd) {
      logs <<- c(logs, conditionMessage(cnd))
      invokeRestart("muffleWarning")
    }
  )

  bare <- gsub("(^|\n)\\[[A-Z]+\\](\\[[^]]*\\])* ", "\\1", logs)

  gsub("\\s+", " ", paste(bare, collapse = " "))
}

# Point the assistant at a throwaway skills directory for the duration of the
# calling test. The package's own inst/skills stays a source, so tests assert
# on the skills they wrote rather than on the whole catalogue.
local_skills_dir <- function(.local_envir = parent.frame()) {

  root <- withr::local_tempdir(.local_envir = .local_envir)

  withr::local_options(
    blockr.assistant_skills = root,
    .local_envir = .local_envir
  )

  root
}
