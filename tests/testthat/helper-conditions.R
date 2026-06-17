cnd_row <- function(block, severity, message, phase = "eval") {
  data.frame(
    block = block, phase = phase, severity = severity,
    message = message, id = message
  )
}

cnd_frame <- function(...) {

  rows <- list(...)

  if (!length(rows)) {
    return(
      data.frame(
        block = character(), phase = character(), severity = character(),
        message = character(), id = character()
      )
    )
  }

  do.call(rbind, rows)
}
