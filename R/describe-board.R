summarise_board <- function(board, view_data = NULL) {

  lines <- describe_board(
    isolate(board$board), block_markers(board),
    view_data = view_data
  )

  paste(lines, collapse = "\n")
}

#' Describe a board for the LLM
#'
#' Generic backing the system prompt's board summary. The default
#' method `describe_board.board` reports the board's blocks, links,
#' stacks and options; `describe_board.dock_board` adds the view and
#' extension summaries via `NextMethod()`. Board sub-classes extend
#' the summary by supplying their own method.
#'
#' @param b A `board`.
#' @param markers Named character vector of per-block markers
#'   carrying the block's eval status and captured conditions, such
#'   as `[stale] [1 error]`, as produced by `block_markers()`.
#' @param ... Passed to methods.
#' @param view_data Reactive holding blockr.dock's live all-views
#'   layout, or `NULL` to read views from the committed board. Views
#'   are a `dock_board` concept, so this is consumed only by the
#'   `dock_board` method -- where it appears in the signature -- not
#'   by the base `board` method.
#'
#' @return Character vector of lines, collapsed with
#'   `paste(..., collapse = "\n")` by `summarise_board()`.
#'
#' @export
describe_board <- function(b, markers, ...) {
  UseMethod("describe_board")
}

#' @rdname describe_board
#' @export
describe_board.board <- function(b, markers, ...) {

  blks <- board_blocks(b)
  lnks <- board_links(b)
  stks <- board_stacks(b)

  header <- glue::glue(
    "{length(blks)} block(s), {length(lnks)} link(s), ",
    "{length(stks)} stack(s)."
  )

  if (!length(blks) && !length(lnks) && !length(stks)) {
    return(paste(header, "(empty board -- no blocks yet)"))
  }

  c(
    header,
    "",
    blocks_section(blks, markers),
    links_section(lnks),
    stacks_section(stks),
    board_options_section(board_options(b))
  )
}

#' @rdname describe_board
#' @export
describe_board.dock_board <- function(b, markers, ..., view_data = NULL) {

  c(
    NextMethod(),
    views_section(resolve_views(b, view_data), b),
    extensions_section(b)
  )
}

resolve_views <- function(b, view_data = NULL) {

  live <- if (is.function(view_data)) isolate(view_data()) else NULL

  if (!is.null(live)) {
    return(live[["views"]])
  }

  if (!inherits(b, "dock_board")) {
    return(list())
  }

  board_views(b)
}

# Each section bounds itself, so a long block list cannot crowd out a later
# section (views, extensions) the way tail-truncating the whole summary would.
# The hint names the trimmed section's own listing tool.
bounded_section <- function(lines, hint,
                            max_chars = board_section_max_chars()) {
  truncate_chars(paste(lines, collapse = "\n"), max_chars, hint)
}

blocks_section <- function(blks, markers = character()) {

  if (!length(blks)) {
    return(character())
  }

  lines <- c(
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

  bounded_section(lines, "call list_blocks for the full list")
}

links_section <- function(lnks) {

  if (!length(lnks)) {
    return(character())
  }

  df <- as.data.frame(lnks)

  lines <- c(
    "### Links",
    chr_ply(
      seq_len(nrow(df)),
      function(i) {
        glue::glue(
          "- {df$id[[i]]}: {df$from[[i]]} -> {df$to[[i]]}${df$input[[i]]}"
        )
      }
    )
  )

  bounded_section(lines, "call list_links for the full list")
}

stacks_section <- function(stks) {

  if (!length(stks)) {
    return(character())
  }

  bounded_section(
    c("### Stacks", paste0("- ", names(stks), " ", chr_ply(stks, str_value))),
    "call list_stacks for the full list"
  )
}

board_options_section <- function(opts) {

  if (!length(opts)) {
    return(character())
  }

  lines <- c(
    "### Options",
    chr_ply(names(opts), function(id) {
      category <- coal(board_option_category(opts[[id]]), NA_character_)
      if (is.na(category)) {
        glue::glue("- {id}")
      } else {
        glue::glue("- {id} ({category})")
      }
    }),
    "Current values via list_board_options; change with set_board_option."
  )

  bounded_section(lines, "call list_board_options for the full list")
}

views_section <- function(vws, b) {

  if (length(vws) <= 1L) {
    return(character())
  }

  labels <- view_names(vws)
  active <- tryCatch(active_view(vws), error = function(e) NA_character_)

  lines <- c(
    "### Views",
    chr_ply(names(vws), function(id) {
      marker <- if (identical(id, active)) " (active)" else ""
      glue::glue(
        "- {labels[[id]]} (id: {id}){marker} {str_value(vws[[id]])}"
      )
    })
  )

  bounded_section(lines, "call list_views for the full list")
}

extensions_section <- function(b) {

  exts <- as.list(dock_extensions(b))

  entries <- unlst(map(ext_summary_line, exts, names(exts)))

  if (!length(entries)) {
    return(character())
  }

  bounded_section(
    c("### Extensions", entries),
    "call list_extensions for the full list"
  )
}

ext_summary_line <- function(ext, id) {

  vars <- external_ctrl_vars(ext)
  desc <- extension_description(ext)

  if (!length(vars) && is.null(desc)) {
    return(NULL)
  }

  line <- glue::glue("- {extension_name(ext)} (id: {id})")

  if (length(vars)) {
    line <- paste0(line, " -- controllable: ", paste(vars, collapse = ", "))
  }

  if (is.null(desc)) {
    line
  } else {
    c(line, paste0("  ", desc))
  }
}
