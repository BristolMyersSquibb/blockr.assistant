added_conditions <- function(baseline, current) {

  seen <- paste(baseline$block, baseline$id, sep = "\r")

  current[
    !paste(current$block, current$id, sep = "\r") %in% seen, ,
    drop = FALSE
  ]
}

format_flush_feedback <- function(outcome, conditions = NULL) {

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

  if (!is.null(conditions) && nrow(conditions)) {
    by_block <- split(conditions, conditions$block)
    parts <- c(
      parts,
      "After applying your changes, some blocks now report problems:",
      chr_mply(format_conditions, by_block, names(by_block))
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
