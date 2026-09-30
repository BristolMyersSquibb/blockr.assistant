# Commands that run R and say nothing to the model, unlike the skill commands
# these register alongside. The `echo = FALSE` is there because shinychat's
# default echoes the invocation whenever a handler is present, and both of
# these rewrite the transcript the echo would land in: the line would sit
# above a summary that is meant to open the compacted conversation, or be
# posted only for `/clear` to wipe it.
register_builtin_commands <- function(mod, compact, clear) {

  mod$slash_command(
    "compact",
    paste(
      "Summarise the conversation so far, keeping the most recent",
      "turns verbatim."
    ),
    compact,
    echo = FALSE
  )

  mod$slash_command(
    "clear",
    "Start a new conversation, keeping this one in the history.",
    clear,
    echo = FALSE
  )

  invisible(mod)
}
