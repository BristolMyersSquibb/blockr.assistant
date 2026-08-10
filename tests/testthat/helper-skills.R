write_skill <- function(root, dir, frontmatter, body = "Body text.") {

  path <- file.path(root, dir)
  dir.create(path, recursive = TRUE, showWarnings = FALSE)

  writeLines(
    c("---", frontmatter, "---", "", body),
    file.path(path, "SKILL.md")
  )

  path
}

# blockr.core's logger writes through `cat`, wrapping each message to the
# console width and re-prefixing every wrapped line, so a reported skill
# problem is neither a condition to catch nor a stable line to match. Divert
# it into a vector and undo the wrapping.
capture_logs <- function(expr) {

  logs <- character()

  withr::local_options(
    blockr.logger = function(msg, level) {
      logs <<- c(logs, msg)
      invisible()
    },
    blockr.log_level = "debug",
    blockr.log_time = FALSE
  )

  force(expr)

  flat <- gsub("\\[[A-Z]+\\]\\[[^]]*\\]", "", paste(logs, collapse = " "))

  gsub("\\s+", " ", flat)
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

catalogue_chars <- function() {
  sum(nchar(chr_ply(global_skills(skill_catalogue()), skill_entry)))
}
