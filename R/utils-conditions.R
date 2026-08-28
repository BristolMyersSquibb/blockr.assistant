format_conditions <- function(df, id) {

  if (!nrow(df)) {
    return(
      glue::glue(
        "Block {id} has no active conditions",
        " (no errors, warnings, or messages)."
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

      header <- glue::glue("{labels[[sev]]}{if (n == 1L) '' else 's'} ({n}):")
      bullets <- glue::glue("- [{sub$phase}] {sub$message}")

      c("", header, bullets)
    }
  )

  paste(
    c(glue::glue("Block {id} conditions:"), unlst(groups)),
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

  parts <- glue::glue(
    "{icons[sevs]} {n} {paste0(sevs, ifelse(n == 1L, '', 's'))}"
  )

  glue::glue("[{paste(parts, collapse = ', ')}]")
}

block_condition_markers <- function(board) {

  ids <- names(isolate(board$blocks))

  if (!length(ids)) {
    return(character())
  }

  conds <- isolate(board$conditions())
  by_block <- split(conds, factor(conds$block, levels = ids))

  chr_ply(by_block, format_condition_marker, use_names = TRUE)
}
