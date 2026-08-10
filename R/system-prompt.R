#' Default assistant system prompt
#'
#' Builds the four-section system prompt the assistant ships by
#' default: an intro / conventions block, an auto-generated tool
#' catalogue from `client$get_tools()`, a one-line-per-skill
#' catalogue of the deployment's globally-scoped skills, and a
#' compact board summary.
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
#' @param client An `ellmer::Chat`. `NULL` omits the tool
#'   catalogue.
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

  tools <- if (!is.null(client)) {
    paste0("\n\n## Tools\n", format_tool_catalogue(client))
  } else {
    ""
  }

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
    tools = tools,
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

format_tool_catalogue <- function(client) {

  tools <- client$get_tools()

  if (!length(tools)) {
    return("(none)")
  }

  lines <- chr_ply(tools, function(t) {
    sprintf(
      "- `%s`: %s",
      format_tool_signature(t),
      gsub("\\s+", " ", t@description)
    )
  })

  paste(lines, collapse = "\n")
}

format_tool_signature <- function(tool) {

  args <- tool@arguments@properties

  if (!length(args)) {
    return(sprintf("%s()", tool@name))
  }

  parts <- chr_ply(names(args), function(nm) {
    if (isTRUE(args[[nm]]@required)) nm else paste0(nm, "?")
  })

  sprintf("%s(%s)", tool@name, paste(parts, collapse = ", "))
}
