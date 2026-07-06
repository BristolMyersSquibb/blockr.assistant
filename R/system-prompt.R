#' Default assistant system prompt
#'
#' Builds the four-section system prompt the assistant ships by
#' default: an intro / conventions block, an auto-generated tool
#' catalogue from `client$get_tools()`, a compact board summary,
#' and (when applicable) a one-line note carrying the previous
#' turn's flush rejection.
#'
#' Each argument is optional; the corresponding section is
#' omitted when its input is `NULL`, so `default_system_prompt()`
#' at the REPL returns just the intro block -- useful for
#' inspecting what the default looks like without mounting a
#' board.
#'
#' This is the default value of `new_assistant_extension`'s
#' `system_prompt` argument. Custom functions passed in its
#' place receive `(board, client, last_flush, ...)`; the `...`
#' is forward-compatibility headroom for future phases adding
#' inputs (accept `...` in custom functions so the call site can
#' grow without breaking you).
#'
#' @param board Reactive containing the live board, as supplied
#'   to the extension server. `NULL` omits the board section.
#' @param client An `ellmer::Chat`. `NULL` omits the tool
#'   catalogue.
#' @param last_flush Reactive holding the previous turn's flush
#'   rejection message (character) or `NULL`. `NULL` (or a
#'   `NULL` value) omits the delta note.
#' @param ... Forward-compatibility slot for future inputs.
#'
#' @return A character scalar.
#'
#' @export
default_system_prompt <- function(board = NULL, client = NULL,
                                  last_flush = NULL, ...) {

  tools <- if (!is.null(client)) {
    paste0("\n\n## Tools\n", format_tool_catalogue(client))
  } else {
    ""
  }

  board_summary <- if (!is.null(board)) {
    paste0("\n\n## Board\n", summarise_board(board))
  } else {
    ""
  }

  err <- if (!is.null(last_flush)) isolate(last_flush()) else NULL

  flush_note <- if (!is.null(err)) {
    paste0(
      "\n\n",
      sprintf(
        paste(
          "Note: your previous turn's changes were rejected: %s.",
          "The board did not change. Re-issue corrected calls."
        ),
        err
      )
    )
  } else {
    ""
  }

  slots <- list(
    layout = read_prompt("layout"),
    tools = tools,
    board = board_summary,
    flush_note = flush_note,
    commit_model = commit_model_note()
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

# Commit model: immediate (default) applies each staged mutation to the live
# board as soon as it is staged, so the block evaluates and the model can
# verify its real result mid-turn and self-correct -- the read-act-observe
# loop. Staged mode batches everything into one atomic flush at turn end.
immediate_commit <- function() {
  isTRUE(blockr_option("assistant_immediate_commit", TRUE))
}

commit_model_note <- function() {

  if (immediate_commit()) {
    paste(
      "Each mutation you make applies to the board IMMEDIATELY and the",
      "block evaluates. Build incrementally and VERIFY as you go: after",
      "adding a block and wiring its inputs, call get_block_result on it",
      "(and get_block_conditions if it errors) to confirm it produces the",
      "data you intended -- then fix it (modify_block, or remove_block +",
      "add_block) and check again BEFORE moving on. A wrong column name is",
      "the usual cause of errors or empty results; query_data the upstream",
      "block to see the real column names and values. Do not build a long",
      "pipeline blind: go add -> wire -> verify -> fix. Never report",
      "success on a block you have not seen produce a sensible result."
    )
  } else {
    paste(
      "Inspection tools always read the committed board, not your staged",
      "changes. Mutation tools *stage* a change; nothing applies mid-turn.",
      "All staged calls from your turn flush as one atomic update when",
      "your turn ends. Your own tool-call history is the record of what is",
      "pending."
    )
  }
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

summarise_board <- function(board, max_chars = 4000L) {

  b <- isolate(board$board)
  blks <- board_blocks(b)
  lnks <- board_links(b)
  stks <- board_stacks(b)
  vws  <- board_views(b)

  header <- sprintf(
    "%d block(s), %d link(s), %d stack(s), %d view(s).",
    length(blks), length(lnks), length(stks), length(vws)
  )

  if (!length(blks) && !length(lnks) && !length(stks) && length(vws) <= 1L) {
    return(paste(header, "(empty board -- no blocks yet)"))
  }

  body <- c(
    header,
    "",
    summarise_blocks(blks, block_condition_markers(board)),
    summarise_links(lnks),
    summarise_stacks(stks),
    summarise_views(vws, b),
    summarise_board_options(board_options(b))
  )

  out <- paste(body, collapse = "\n")

  if (nchar(out) > max_chars) {

    return(
      paste(
        header,
        "(too many entities to inline; call list_blocks,",
        "list_links, list_stacks and list_views for the full set)"
      )
    )
  }

  out
}

board_views <- function(b) {

  if (!inherits(b, "dock_board")) {
    return(structure(list(), class = "dock_layouts"))
  }

  board_layouts(b)
}

summarise_blocks <- function(blks, markers = character()) {

  if (!length(blks)) {
    return(character())
  }

  c(
    "### Blocks",
    chr_ply(names(blks), function(id) {

      line <- paste0("- ", id, " ", str_value(blks[[id]]))

      if (id %in% names(markers) && nzchar(markers[[id]])) {
        paste0(line, " ", markers[[id]])
      } else {
        line
      }
    })
  )
}

summarise_links <- function(lnks) {

  if (!length(lnks)) {
    return(character())
  }

  df <- as.data.frame(lnks)

  c(
    "### Links",
    chr_ply(
      seq_len(nrow(df)),
      function(i) {
        sprintf(
          "- %s: %s -> %s$%s",
          df$id[[i]], df$from[[i]], df$to[[i]], df$input[[i]]
        )
      }
    )
  )
}

summarise_stacks <- function(stks) {

  if (!length(stks)) {
    return(character())
  }

  c(
    "### Stacks",
    paste0("- ", names(stks), " ", chr_ply(stks, str_value))
  )
}

summarise_board_options <- function(opts) {

  if (!length(opts)) {
    return(character())
  }

  c(
    "### Options",
    chr_ply(names(opts), function(id) {
      category <- coal(board_option_category(opts[[id]]), NA_character_)
      if (is.na(category)) {
        sprintf("- %s", id)
      } else {
        sprintf("- %s (%s)", id, category)
      }
    }),
    "Current values via list_board_options; change with set_board_option."
  )
}

summarise_views <- function(vws, b) {

  if (length(vws) <= 1L) {
    return(character())
  }

  labels <- view_names(vws)
  active <- tryCatch(active_view(vws), error = function(e) NA_character_)

  c(
    "### Views",
    chr_ply(names(vws), function(id) {
      marker <- if (identical(id, active)) " (active)" else ""
      sprintf(
        "- %s (id: %s)%s %s",
        labels[[id]], id, marker, str_value(vws[[id]])
      )
    })
  )
}
