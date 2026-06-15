format_conditions <- function(df, id) {

  if (!nrow(df)) {
    return(
      sprintf(
        "Block %s has no active conditions (no errors, warnings, or messages).",
        id
      )
    )
  }

  labels <- c(error = "Error", warning = "Warning", message = "Message")
  sevs <- intersect(names(labels), df$severity)

  groups <- lapply(
    sevs,
    function(sev) {

      sub <- df[df$severity == sev, , drop = FALSE]
      n <- nrow(sub)

      header <- sprintf(
        "%s%s (%d):", labels[[sev]], if (n == 1L) "" else "s", n
      )
      bullets <- sprintf("- [%s] %s", sub$phase, sub$message)

      c("", header, bullets)
    }
  )

  paste(
    c(sprintf("Block %s conditions:", id), unlst(groups)),
    collapse = "\n"
  )
}

condition_icons <- function() {
  set_names(
    intToUtf8(c(0x2716, 0x26a0, 0x2139), multiple = TRUE),
    c("error", "warning", "message")
  )
}

format_condition_marker <- function(df) {

  if (!nrow(df)) {
    return("")
  }

  icons <- condition_icons()

  counts <- table(factor(df$severity, levels = names(icons)))
  keep <- counts > 0L

  sevs <- names(icons)[keep]
  n <- as.integer(counts[keep])

  parts <- sprintf(
    "%s %d %s",
    icons[sevs], n, paste0(sevs, ifelse(n == 1L, "", "s"))
  )

  sprintf("[%s]", paste(parts, collapse = ", "))
}

block_condition_marker <- function(id, conditions) {
  format_condition_marker(conditions[conditions$block == id, , drop = FALSE])
}

block_condition_markers <- function(board) {

  ids <- names(isolate(board$blocks))

  if (!length(ids)) {
    return(character())
  }

  set_names(
    chr_ply(ids, block_condition_marker, isolate(board$conditions())),
    ids
  )
}
