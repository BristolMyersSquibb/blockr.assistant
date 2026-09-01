# A command that runs R and says nothing to the model, unlike the skill
# commands it registers alongside. The `echo = FALSE` is there because
# shinychat's default echoes the invocation whenever a handler is present, and
# this one rewrites the transcript the echo would land in: the line would sit
# above a summary that is meant to open the compacted conversation.
register_builtin_commands <- function(mod, compact) {

  mod$slash_command(
    "compact",
    paste(
      "Summarise the conversation so far, keeping the most recent",
      "turns verbatim."
    ),
    compact,
    echo = FALSE
  )

  invisible(mod)
}
