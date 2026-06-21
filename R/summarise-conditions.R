summarise_conditions <- function(cond) {

  phase_order <- c("data", "state", "eval", "render", "block")
  phases <- names(cond)
  phases <- c(intersect(phase_order, phases), setdiff(phases, phase_order))

  per_severity <- lapply(
    c("error", "warning", "message"),
    function(sev) {

      msgs <- lst_xtr(cond[phases], sev)
      lens <- lengths(msgs)

      if (!any(lens)) {
        return(NULL)
      }

      data.frame(
        severity  = sev,
        phase     = rep(phases, lens),
        message   = chr_ply(unlst(msgs), as.character),
        row.names = NULL
      )
    }
  )

  out <- do.call(rbind, per_severity)

  if (is.null(out)) {
    return(
      data.frame(
        severity = character(),
        phase    = character(),
        message  = character()
      )
    )
  }

  out
}

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

block_condition_marker <- function(blk) {

  # `blk$server` may still be a not-yet-ready closure (blockr.dock prerenders
  # blocks before their server objects materialise), so reach for `$cond`
  # defensively -- same guard as block_eval_error(). A block whose server
  # isn't ready simply contributes no marker.
  cond <- tryCatch(blk$server$cond, error = function(e) NULL)

  if (is.null(cond)) {
    return("")
  }

  tryCatch(
    format_condition_marker(
      summarise_conditions(isolate(reactiveValuesToList(cond)))
    ),
    error = function(e) ""
  )
}

block_condition_markers <- function(board) {

  servers <- isolate(board$blocks)

  if (!length(servers)) {
    return(character())
  }

  set_names(chr_ply(servers, block_condition_marker), names(servers))
}
