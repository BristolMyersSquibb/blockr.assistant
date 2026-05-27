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

  intro <- paste(
    "You are an assistant embedded next to a blockr data analysis",
    "board. The Tools section below lists what you can call; the",
    "Board section is the current shape of the board.",
    "",
    "Inspection tools always read the committed board, not your",
    "staged changes. Mutation tools *stage* a change; nothing",
    "applies mid-turn. All staged calls from your turn flush as one",
    "atomic update when your turn ends. Your own tool-call history",
    "is the record of what is pending.",
    "",
    "Block, link and stack ids are immutable once committed. If the",
    "user asks to rename one, explain you can offer remove + add",
    "with a new id, but that tears down the block server and",
    "re-evaluates downstream blocks -- ask before proceeding. For",
    "a still-staged entity, use remove + add to change the id.",
    "",
    "modify_block can only change keys reported as modifiable in",
    "the Board section above (and block_name, always). For other",
    "changes use remove_block + add_block.",
    "",
    "## Layout",
    "",
    "Views are named tabs; each holds its own arrangement of panels",
    "(blocks and extensions). modify_view and add_view take a full",
    "layout in JSON spec form -- read the current shape with",
    "list_views, edit the structure, and write it back. The layout",
    "shape is recursive:",
    "",
    "- a bare ID string is a single-panel leaf",
    "- an array of IDs is a tabbed leaf (first is active by default)",
    "- `{\"panels\": [...], \"active\": \"<id>\"}` is a tabbed leaf with",
    "  explicit active tab",
    "- `{\"group\": [<children>], \"sizes\": [...]}` splits children in",
    "  the parent's orientation with explicit ratios; even splits",
    "  are an unnamed array of children at that position",
    "- top level: `{\"children\": [...], \"orientation\":",
    "  \"horizontal\"|\"vertical\", \"sizes\": [...], \"active_group\":",
    "  \"...\"}`",
    "",
    "Blocks referenced by a view layout must exist on the board (or",
    "be staged for creation in the same turn). Removing a block",
    "automatically drops its panels from every view containing it",
    "-- no explicit cleanup needed.",
    "",
    "Answer concisely.",
    sep = "\n"
  )

  sections <- intro

  if (!is.null(client)) {
    sections <- c(
      sections, "", "## Tools", format_tool_catalogue(client)
    )
  }

  if (!is.null(board)) {
    sections <- c(
      sections, "", "## Board", summarise_board(board)
    )
  }

  err <- if (!is.null(last_flush)) isolate(last_flush()) else NULL

  if (!is.null(err)) {
    sections <- c(
      sections,
      "",
      sprintf(
        paste(
          "Note: your previous turn's changes were rejected: %s.",
          "The board did not change. Re-issue corrected calls."
        ),
        err
      )
    )
  }

  paste(sections, collapse = "\n")
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
    summarise_blocks(blks, b),
    summarise_links(lnks),
    summarise_stacks(stks),
    summarise_views(vws, b)
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

summarise_blocks <- function(blks, board) {

  if (!length(blks)) {
    return(character())
  }

  c(
    "### Blocks",
    chr_ply(names(blks), function(id) {
      summarise_block(blks[[id]], board = board, id = id)
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
    chr_ply(names(stks), function(id) {
      sprintf("- %s %s", id, summarise_stack(stks[[id]]))
    })
  )
}

summarise_views <- function(vws, b) {

  if (length(vws) <= 1L) {
    return(character())
  }

  active <- tryCatch(active_view(vws), error = function(e) NA_character_)

  c(
    "### Views",
    chr_ply(names(vws), function(nm) {
      marker <- if (identical(nm, active)) " (active)" else ""
      sprintf("- %s%s %s", nm, marker, summarise_view(vws[[nm]]))
    })
  )
}
