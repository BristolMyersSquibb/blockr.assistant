block_report_conditions <- function(blk) {

  cond <- blk$server$cond

  if (is.null(cond)) {
    return(summarise_conditions(list()))
  }

  df <- summarise_conditions(isolate(reactiveValuesToList(cond)))

  df[df$severity %in% c("error", "warning"), , drop = FALSE]
}

snapshot_conditions <- function(board) {

  servers <- isolate(board$blocks)

  if (!length(servers)) {
    return(list())
  }

  lapply(servers, block_report_conditions)
}

condition_keys <- function(df) {

  if (!nrow(df)) {
    return(character())
  }

  paste(df$severity, df$phase, df$id, sep = "\x1f")
}

new_block_conditions <- function(baseline, current) {

  diff_one <- function(id) {

    cur <- current[[id]]
    base <- baseline[[id]]

    if (is.null(base)) {
      return(cur)
    }

    cur[!condition_keys(cur) %in% condition_keys(base), , drop = FALSE]
  }

  fresh <- lapply(names(current), diff_one)
  names(fresh) <- names(current)

  Filter(NROW, fresh)
}

format_flush_feedback <- function(outcome, new_conds) {

  parts <- character()

  if (!is.null(outcome) && isFALSE(outcome$ok)) {
    parts <- c(
      parts,
      sprintf(
        paste(
          "The board update from your last turn was rejected during the %s",
          "phase and the board was not changed: %s"
        ),
        outcome$phase, outcome$message
      )
    )
  }

  if (length(new_conds)) {
    parts <- c(
      parts,
      "After applying your changes, some blocks now report problems:",
      chr_mply(format_conditions, new_conds, names(new_conds))
    )
  }

  if (!length(parts)) {
    return(NULL)
  }

  paste(
    c(
      paste(
        "[Automatic board check after applying your changes.] Correct the",
        "problem if it was unintended, or briefly confirm if the result is",
        "expected."
      ),
      parts
    ),
    collapse = "\n\n"
  )
}
