#' Report which just-changed blocks did not evaluate cleanly
#'
#' Reads the LIVE post-flush state of the given block ids -- the results and
#' conditions the running app has already computed (`board$blocks[[id]]$server`)
#' -- and returns a compact note for any block that errored or came back empty.
#' This is the cheap, accurate counterpart to a headless dry-run: the app
#' evaluated these blocks anyway, so we just read what happened instead of
#' recomputing it. It gives the model the same "did it actually work" signal
#' blockr.ai gets from its validate loop, sourced from the real session.
#'
#' Only problems are returned (clean blocks produce nothing), so a successful
#' build adds no tokens to the next prompt.
#'
#' @param board The assistant board handle (`list(board=, blocks=)`).
#' @param ids Character vector of block ids changed in the last flush.
#' @return Character vector of problem lines, or `NULL` if all clean.
#' @noRd
eval_report <- function(board, ids) {

  blks <- isolate(board$blocks)
  ids  <- intersect(ids, names(blks))
  if (!length(ids)) {
    return(NULL)
  }

  lines <- vapply(ids, function(id) {
    srv <- blks[[id]]$server

    err <- block_eval_error(srv)
    res <- tryCatch(isolate(srv$result()), error = function(e) e)
    if (is.null(err) && inherits(res, "error")) {
      err <- conditionMessage(res)
    }

    if (!is.null(err)) {
      sprintf("- %s: ERROR -- %s%s", id, err, upstream_cols_hint(board, id))
    } else if (is.data.frame(res) && nrow(res) == 0L) {
      sprintf("- %s: EMPTY%s", id, effect_hint(board, id, res))
    } else if (is.null(res)) {
      sprintf("- %s: EMPTY (no result)%s", id, upstream_cols_hint(board, id))
    } else if (is.data.frame(res)) {
      sprintf("- %s: ok%s", id, effect_hint(board, id, res))
    } else {
      sprintf("- %s: ok (%s)", id, paste(class(res), collapse = "/"))
    }
  }, character(1L))

  problems <- lines[grepl("ERROR|EMPTY", lines)]
  if (!length(problems)) {
    return(NULL)
  }
  problems
}

# Pull the error message(s) off a block server's condition state (the same
# `$cond` get_block_conditions reads), or NULL if none.
block_eval_error <- function(srv) {
  cond <- tryCatch(srv$cond, error = function(e) NULL)
  if (is.null(cond)) {
    return(NULL)
  }
  df <- tryCatch(
    summarise_conditions(isolate(reactiveValuesToList(cond))),
    error = function(e) NULL
  )
  if (is.null(df) || !nrow(df)) {
    return(NULL)
  }
  e <- df$message[df$severity == "error"]
  if (!length(e)) {
    return(NULL)
  }
  paste(e, collapse = "; ")
}

# Compact "did it do anything" effect, mirroring blockr.ai data_effect but
# computed inline (no blockr.ai dependency): rows in -> out, and any new cols.
effect_hint <- function(board, id, res) {
  up <- upstream_result(board, id)
  if (is.null(up) || !is.data.frame(up) || !is.data.frame(res)) {
    return(sprintf(" (%d rows x %d cols)", nrow(res), ncol(res)))
  }
  new_cols <- setdiff(names(res), names(up))
  bits <- sprintf("%d -> %d rows", nrow(up), nrow(res))
  if (length(new_cols)) {
    bits <- paste0(bits, ", +", paste(utils::head(new_cols, 6L), collapse = ","))
  }
  paste0(" (", bits, ")")
}

# On error/empty, the most useful fix material is the upstream's real column
# names (the model usually referenced a column that isn't there). Cheap: just
# names, no values.
upstream_cols_hint <- function(board, id) {
  up <- upstream_result(board, id)
  if (is.null(up) || !is.data.frame(up) || !ncol(up)) {
    return("")
  }
  cols <- names(up)
  if (length(cols) > 40L) {
    cols <- c(cols[seq_len(40L)], sprintf("...(+%d)", length(cols) - 40L))
  }
  sprintf(" | upstream cols: %s", paste(cols, collapse = ", "))
}

# First upstream block's live result (for effect / column hints).
upstream_result <- function(board, id) {
  brd  <- isolate(board$board)
  blks <- isolate(board$blocks)
  lnks <- blockr.core::board_links(brd)
  n <- length(lnks)
  if (!n) {
    return(NULL)
  }
  for (i in seq_len(n)) {
    if (identical(lnks[[i]]$to, id)) {
      from <- lnks[[i]]$from
      if (from %in% names(blks)) {
        return(tryCatch(isolate(blks[[from]]$server$result()),
                        error = function(e) NULL))
      }
    }
  }
  NULL
}
