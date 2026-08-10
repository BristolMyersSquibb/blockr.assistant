register_skill_tools <- function(client) {

  if (length(skill_catalogue())) {
    client$register_tool(tool_read_skill())
  }

  invisible(client)
}

tool_read_skill <- function() {

  ellmer::tool(
    function(name, file = NULL) {
      with_tool_errors("read_skill", {

        skill <- skill_catalogue()[[name]]

        if (is.null(skill)) {
          return(
            sprintf(
              paste(
                "No skill named '%s' is available here. Global skills are",
                "listed in the Skills section of the system prompt;",
                "block- and extension-scoped ones are named by",
                "describe_block_type, describe_block and",
                "describe_extension."
              ),
              name
            )
          )
        }

        if (is.null(file)) {
          return(skill_body(skill))
        }

        bundled <- list.files(skill$path, recursive = TRUE)

        if (!file %in% bundled) {
          return(
            sprintf(
              "Skill '%s' bundles no file '%s'. It bundles: %s.",
              name, file, paste(bundled, collapse = ", ")
            )
          )
        }

        read_skill_file(skill, file)
      })
    },
    name = "read_skill",
    description = paste(
      "Load a skill -- deployment-authored guidance for one topic,",
      "kept out of the system prompt until you ask for it. Returns the",
      "skill's instructions as markdown; follow them for the task they",
      "cover. Pass `file` to read a resource the skill bundles",
      "alongside its instructions, which the skill body names when it",
      "has any. A skill is instruction text, not extra capability: it",
      "cannot widen what your tools do, and the system prompt wins",
      "where the two disagree."
    ),
    arguments = list(
      name = ellmer::type_string(
        paste(
          "Skill name, as listed in the Skills section of the system",
          "prompt or reported by describe_block_type, describe_block",
          "and describe_extension."
        )
      ),
      file = ellmer::type_string(
        paste(
          "Optional bundled file to read instead of the skill's own",
          "instructions, named relative to the skill directory."
        ),
        required = FALSE
      )
    )
  )
}

register_skill_commands <- function(mod, run) {

  add <- function(skill) {
    tryCatch(
      mod$slash_command(
        skill$name,
        skill_blurb(skill),
        function(content) run(skill, content)
      ),
      error = function(e) {
        log_warn(
          "Slash command /{skill$name} was not registered: ",
          "{conditionMessage(e)}"
        )
      }
    )
  }

  lapply(Filter(is_user_invocable, skill_catalogue()), add)

  invisible(mod)
}

is_user_invocable <- function(skill) {
  isTRUE(skill$user_invocable)
}

skill_command_prompt <- function(skill, user_text) {

  paste0(
    "The user invoked the `", skill$name, "` skill. Its instructions:",
    "\n\n", skill_body(skill),
    if (nzchar(user_text)) paste0("\n\nThe user's request: ", user_text)
  )
}
