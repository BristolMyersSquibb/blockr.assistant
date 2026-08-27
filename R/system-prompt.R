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
#' @param focus Character vector of block IDs the user has singled
#'   out as what they are working on, as reported by the extension's
#'   block picker. The focus section is omitted when this is `NULL`
#'   or names no block still on `board`.
#' @param ... Forward-compatibility slot for future inputs.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function(board = NULL, client = NULL,
                                  view_data = NULL, skills = NULL,
                                  focus = NULL, ...) {

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

  focused <- if (!is.null(board)) {
    format_focus(board, focus)
  }

  focus_section <- if (!is.null(focused)) {
    paste0("\n\n## Focus\n", focused)
  } else {
    ""
  }

  slots <- list(
    skills = skill_section,
    board = board_summary,
    focus = focus_section
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

format_focus <- function(board, focus) {

  blks <- board_blocks(isolate(board$board))
  hits <- intersect(focus, names(blks))

  if (!length(hits)) {
    return(NULL)
  }

  paste(
    c(
      focus_preamble(),
      "",
      paste0("- ", hits, " ", chr_ply(blks[hits], str_value))
    ),
    collapse = "\n"
  )
}

focus_preamble <- function() {
  paste(
    c(
      "The user has singled out the block(s) listed below as what",
      "they are working on. Read an under-specified request -- \"add",
      "a filter\", \"switch the axes\" -- as being about them, and",
      "prefer them where a request could plausibly land on several",
      "blocks. This says where the user's attention is; it does not",
      "narrow what you may do. Answer freely about any other part of",
      "the board, and never decline or defer a question because its",
      "subject is not listed here. Nothing about this section asks",
      "you to call `focus_panel`, which fronts a panel's tab and is",
      "a separate matter."
    ),
    collapse = "\n"
  )
}

read_prompt <- function(name) {

  path <- system.file(
    "prompts", paste0(name, ".md"),
    package = "blockr.assistant"
  )

  paste(readLines(path, warn = FALSE), collapse = "\n")
}
