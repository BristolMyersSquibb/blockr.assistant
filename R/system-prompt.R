#' Default assistant system prompt
#'
#' Builds the three-section system prompt the assistant ships by
#' default: an intro / conventions block, a one-line-per-skill
#' catalogue of the deployment's globally-scoped skills, and a
#' compact board summary.
#'
#' The registered tools are deliberately not catalogued here. They
#' reach the model as a structured tool manifest alongside the
#' system prompt, so a prompt-side listing duplicates them -- and
#' the per-block-type tools come and go within a conversation, so
#' any such listing would go stale mid-turn.
#'
#' Each argument is optional; the corresponding section is
#' omitted when its input is `NULL`, so `default_system_prompt()`
#' at the REPL returns just the intro block -- useful for
#' inspecting what the default looks like without mounting a
#' board.
#'
#' This is the default value of `new_assistant_extension`'s
#' `system_prompt` argument. Custom functions passed in its
#' place receive `(board, client, ...)`; the `...` is
#' forward-compatibility headroom for future phases adding
#' inputs (accept `...` in custom functions so the call site can
#' grow without breaking you).
#'
#' @param board Reactive containing the live board, as supplied
#'   to the extension server. `NULL` omits the board section.
#' @param client An `ellmer::Chat`. Unused by this composer, and
#'   passed for the benefit of custom ones -- the model and token
#'   state are read off it.
#' @param view_data Reactive holding `blockr.dock`'s live all-views
#'   layout (a `list(views, grids)`), as supplied to the extension
#'   server, or `NULL`. Read for the board section's view summary,
#'   falling back to the committed `board` when `NULL` (before every
#'   view has reported its layout).
#' @param skills The available skills, as supplied to the extension
#'   server. `NULL` omits the skill catalogue. Only globally-scoped
#'   skills are listed here; block- and extension-scoped ones surface
#'   through the tools that describe their target.
#' @param ... Forward-compatibility slot for future inputs.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function(board = NULL, client = NULL,
                                  view_data = NULL, skills = NULL, ...) {

  catalogue <- if (!is.null(skills)) {
    format_skill_catalogue(global_skills(skills))
  }

  skill_section <- if (!is.null(catalogue)) {
    paste0("\n\n## Skills\n", catalogue)
  } else {
    ""
  }

  board_summary <- if (!is.null(board)) {
    paste0("\n\n## Board\n", summarise_board(board, view_data))
  } else {
    ""
  }

  slots <- list(
    skills = skill_section,
    board = board_summary
  )

  as.character(
    glue::glue_data(
      slots,
      read_prompt("system-prompt"),
      .open = "<<",
      .close = ">>",
      .trim = FALSE
    )
  )
}

read_prompt <- function(name) {

  path <- system.file(
    "prompts", paste0(name, ".md"),
    package = "blockr.assistant"
  )

  paste(readLines(path, warn = FALSE), collapse = "\n")
}
