#' @rdname new_assistant_plugin
#' @export
plugin_requests.assistant_plugin <- function(x, ...) {
  list(
    describe_result = request_describe_result,
    inspect_results = request_inspect_results,
    list_skills = request_list_skills,
    read_skill = request_read_skill,
    read_template = request_read_template,
    read_model_settings = request_read_model_settings
  )
}

# What `describe_result()` writes about the result of each block that the
# request reads, by block id, through `summarise_result()`.
# A request that reads no block gets an empty object.
request_describe_result <- function(reads) {
  set_names(
    lapply(lst_xtr(reads, "result"), summarise_result),
    coal(names(reads), character())
  )
}

# The model's own R code, run with each block's result bound to its id, as
# today's tool `inspect_results` ran it.
# A reply carries at most one binary body, so the plots go in the JSON value,
# each a PNG as a base64 string.
request_inspect_results <- function(code, reads, width = NULL, height = NULL) {

  if (board_locked()) {
    blockr_abort(
      "The board is locked, so the assistant runs no R code of its own.",
      class = "locked_board"
    )
  }

  if (!is_string(code)) {
    blockr_abort(
      "The request inspect_results takes its R code as one string, in `code`.",
      class = "invalid_inspect_code"
    )
  }

  env <- inspect_env(lst_xtr(reads, "result"))
  exprs <- parse(text = code, keep.source = FALSE)

  drawn <- capture_drawings(
    function() utils::capture.output(print_last_value(exprs, env)),
    width = device_px(width),
    height = device_px(height)
  )

  on.exit(unlink(drawn$dir, recursive = TRUE), add = TRUE)

  max_plots <- plot_render_max()
  shown <- drawn$files[seq_len(min(length(drawn$files), max_plots))]

  output <- c(
    cut_output(drawn$value),
    if (length(shown)) dropped_drawings_line(length(drawn$files), max_plots)
  )

  list(
    output = paste(output, collapse = "\n"),
    plots = chr_ply(shown, base64enc::base64encode, use_names = FALSE)
  )
}

# Runs each expression in turn and prints the value of the last one where it
# is visible, as R's console does.
# The device is open meanwhile, so a value whose print method draws, such as a
# ggplot or a `captured_plot`, draws on it.
# An invisible value stays unprinted, as at the console, so that code which
# draws and returns its plot invisibly draws it once.
print_last_value <- function(exprs, env) {

  last <- list(value = NULL, visible = FALSE)

  for (expr in exprs) {
    last <- withVisible(eval(expr, envir = env))
  }

  if (last$visible && !is.null(last$value)) {
    print(last$value)
  }

  invisible()
}

# What the code printed, cut on a whole line at `assistant_eval_max_chars`.
# The marker alone reads as a footnote, and a model shown the head of a frame
# that way took it for the whole table, so the hint says what the cut means.
cut_output <- function(lines) {

  if (!length(lines)) {
    return(character())
  }

  truncate_chars(
    paste(lines, collapse = "\n"),
    eval_max_chars(),
    hint = paste(
      "the output is incomplete. What is above is its beginning, not",
      "the whole result, and nothing after this cut was shown to you,",
      "so do not conclude what the rest holds or lacks. Ask again for",
      "just the part you need, or print the rest a piece at a time"
    ),
    whole_lines = TRUE
  )
}

# Whether the board lock is on, as core reads the blockr option `locked`:
# an environment variable gives a string, which R reads as `as.logical()`
# does.
board_locked <- function() {

  x <- blockr_option("locked", FALSE)

  if (is.character(x)) {
    x <- as.logical(trimws(x))
  }

  isTRUE(x)
}

# Each skill of the app's packages and of the deployment, in the order that
# `skill_catalogue()` lists them, with the flags of its frontmatter under the
# names that the frontmatter gives them.
request_list_skills <- function(packages) {
  lapply(unname(skill_catalogue(packages)), skill_reply)
}

skill_reply <- function(skill) {
  list(
    name = skill$name,
    description = skill$description,
    blocks = skill$blocks,
    plugins = skill$plugins,
    `user-invocable` = skill$user_invocable,
    `disable-model-invocation` = !skill$model_invocable
  )
}

# The text of a skill without its frontmatter, or of a file that the skill
# bundles, named by its path in the skill's directory.
# R reads a skill that sets `disable-model-invocation` too, for the chat's
# `/name`, while the tool `read_skill` refuses it to the model.
request_read_skill <- function(name, packages, path = NULL) {

  if (!is_string(name)) {
    blockr_abort(
      "The request read_skill names a skill by a string, in `name`.",
      class = "invalid_skill_name"
    )
  }

  skill <- skill_catalogue(packages)[[name]]

  if (is.null(skill)) {
    blockr_abort(
      "No skill named {name} is available here. The Skills section of the ",
      "system prompt lists the skills that name no class, and ",
      "describe_block_type, describe_block and get_plugin_state list those ",
      "that name one.",
      class = "unknown_skill"
    )
  }

  if (is.null(path)) {
    return(skill_body(skill))
  }

  if (!is_string(path)) {
    blockr_abort(
      "The request read_skill names a file of the skill by its path, a ",
      "string, in `path`.",
      class = "invalid_skill_path"
    )
  }

  bundled <- list.files(skill$path, recursive = TRUE)

  if (!path %in% bundled) {
    blockr_abort(
      "Skill {name} bundles no file {path}. It bundles: ",
      "{paste(bundled, collapse = ', ')}.",
      class = "unbundled_skill_file"
    )
  }

  read_skill_file(skill, path)
}

# The text of the deployment's template, the file that the blockr option
# `assistant_template` names, or `NULL` where the option names none.
request_read_template <- function() {

  lines <- read_option_file(
    "assistant_template",
    "template",
    function(path) readLines(path, warn = FALSE, encoding = "UTF-8")
  )

  if (is.null(lines)) {
    return(NULL)
  }

  paste(lines, collapse = "\n")
}

# What the YAML file that the blockr option `assistant_model_settings` names
# holds, as `yaml::read_yaml()` parses it, or `NULL` where the option names
# none.
# Only `true` and `false` are booleans, as in YAML 1.2, so that an unquoted
# `off`, a thinking level, stays a string, where YAML 1.1 reads it as `FALSE`.
# The plugin checks the settings that the file gives each model.
request_read_model_settings <- function() {
  read_option_file(
    "assistant_model_settings",
    "model settings",
    function(path) {
      yaml::read_yaml(
        path,
        handlers = list("bool#yes" = yaml_bool, "bool#no" = yaml_bool)
      )
    }
  )
}

# A word that YAML 1.1 reads as a boolean, as YAML 1.2 reads it: `true` and
# `false`, in each of the three ways that YAML 1.2 writes them, as booleans,
# and any other word, such as `off` or `yes`, as it is written.
yaml_bool <- function(x) {

  if (x %in% c("true", "True", "TRUE")) {
    return(TRUE)
  }

  if (x %in% c("false", "False", "FALSE")) {
    return(FALSE)
  }

  x
}

# What `read()` reads of the file that the blockr option `option` names, by
# its path, or `NULL` where the option names none.
# The errors name the file as the `what` of the option, such as its
# "template", and take their classes from it, such as `unreadable_template`.
read_option_file <- function(option, what, read) {

  path <- blockr_option(option, NULL)

  if (is.null(path)) {
    return(NULL)
  }

  stem <- gsub(" ", "_", what, fixed = TRUE)

  if (!is_string(path)) {
    blockr_abort(
      "The blockr option {option} names one file, by its path.",
      class = paste0("invalid_", stem, "_option")
    )
  }

  unreadable <- function(cnd) {
    blockr_abort(
      "R cannot read the {what} {path} that the blockr option {option} ",
      "names: {conditionMessage(cnd)}",
      class = paste0("unreadable_", stem)
    )
  }

  tryCatch(read(path), warning = unreadable, error = unreadable)
}
