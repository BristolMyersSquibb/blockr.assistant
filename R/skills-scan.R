skill_cache <- new.env(parent = emptyenv())

skill_catalogue <- function() {

  sources <- skill_sources()
  dirs    <- skill_dirs(sources)

  stamp <- list(
    dirs  = dirs,
    mtime = file.mtime(c(sources, file.path(dirs, "SKILL.md")))
  )

  if (!identical(stamp, skill_cache$stamp)) {
    skill_cache$skills <- scan_skills(dirs)
    skill_cache$stamp  <- stamp
  }

  skill_cache$skills
}

skill_sources <- function() {

  builtin <- system.file("skills", package = "blockr.assistant")
  configured <- blockr_option("assistant_skills", NULL)

  if (is.null(configured)) {
    return(builtin[dir.exists(builtin)])
  }

  if (!is_string(configured)) {
    blockr_abort(
      "The assistant_skills option must be a single directory path.",
      class = "invalid_skills_option"
    )
  }

  if (!dir.exists(configured)) {
    blockr_abort(
      "The assistant_skills directory {configured} does not exist.",
      class = "missing_skills_dir"
    )
  }

  c(builtin[dir.exists(builtin)], configured)
}

skill_dirs <- function(sources) {

  dirs <- unlst(lapply(sources, list.dirs, recursive = FALSE))

  dirs[file.exists(file.path(dirs, "SKILL.md"))]
}

scan_skills <- function(dirs) {

  skills <- list()

  for (skill in compact(lapply(dirs, parse_skill))) {

    if (!is.null(skills[[skill$name]])) {
      log_debug(
        "Skill {skill$name} at {skill$path} shadows the one at ",
        "{skills[[skill$name]]$path}."
      )
    }

    skills[[skill$name]] <- skill
  }

  keep <- lgl_ply(skills, skill_available)

  if (any(!keep)) {
    log_debug(
      "Skills unavailable on unmet requirements: ",
      "{paste(chr_ply(skills[!keep], unmet_summary), collapse = '; ')}."
    )
  }

  log_debug("Loaded {sum(keep)} of {length(skills)} skill(s).")

  warn_catalogue_budget(skills[keep])

  skills[keep]
}

# The per-skill cap bounds one description; what nobody sees coming is N of
# them. A site accumulates skills over months and every turn gets longer, so
# say so here -- once per rescan, not once per prompt.
warn_catalogue_budget <- function(skills) {

  budget <- skill_catalogue_max_chars()
  size <- sum(nchar(chr_ply(global_skills(skills), skill_entry)))

  if (size > budget) {
    log_warn(
      "The always-on skill catalogue is {size} characters, over the ",
      "{budget} character budget: trim the descriptions of the ",
      "{length(global_skills(skills))} global skills, or scope some of ",
      "them to the blocks or extensions they bear on."
    )
  }

  invisible()
}

parse_skill <- function(dir) {

  file  <- file.path(dir, "SKILL.md")
  front <- split_frontmatter(readLines(file, warn = FALSE))

  if (is.null(front)) {
    log_warn("Skill file {file} has no YAML frontmatter; skipped.")
    return(NULL)
  }

  meta <- tryCatch(
    yaml::yaml.load(paste(front$meta, collapse = "\n")),
    error = function(e) e
  )

  if (inherits(meta, "error")) {
    log_warn(
      "Skill file {file} has malformed frontmatter: ",
      "{conditionMessage(meta)}; skipped."
    )
    return(NULL)
  }

  if (!is.list(meta) || !is_string(meta[["name"]]) ||
        !is_string(meta[["description"]]) ||
        !nzchar(meta[["description"]])) {
    log_warn(
      "Skill file {file} needs a `name` and a non-empty `description` ",
      "in its frontmatter; skipped."
    )
    return(NULL)
  }

  name <- meta[["name"]]

  if (!grepl("^[a-z0-9-]+$", name)) {
    log_warn(
      "Skill name {name} ({file}) may only hold lowercase letters, ",
      "digits and hyphens; skipped."
    )
    return(NULL)
  }

  if (!identical(name, basename(dir))) {
    log_warn(
      "Skill name {name} does not match its directory {basename(dir)}; ",
      "skipped."
    )
    return(NULL)
  }

  if ("allowed-tools" %in% names(meta)) {
    log_warn(
      "Skill {name} sets `allowed-tools`, which the assistant does not ",
      "honour; every tool stays reachable while it is loaded."
    )
  }

  requires <- parse_requires(meta[["requires"]], name)

  if (is.null(requires)) {
    return(NULL)
  }

  user_invocable  <- isTRUE(meta[["user-invocable"]])
  model_invocable <- !isTRUE(meta[["disable-model-invocation"]])

  if (!model_invocable && !user_invocable) {
    log_warn(
      "Skill {name} disables model invocation without setting ",
      "`user-invocable`, so nothing can reach it."
    )
  }

  list(
    name            = name,
    description     = meta[["description"]],
    path            = dir,
    blocks          = as.character(meta[["blocks"]]),
    extensions      = as.character(meta[["extensions"]]),
    requires        = requires,
    user_invocable  = user_invocable,
    model_invocable = model_invocable
  )
}

split_frontmatter <- function(lines) {

  open <- which(nzchar(trimws(lines)))[1L]

  if (is.na(open) || !identical(trimws(lines[[open]]), "---") ||
        open >= length(lines)) {
    return(NULL)
  }

  rest  <- lines[seq.int(open + 1L, length(lines))]
  close <- which(trimws(rest) == "---")[1L]

  if (is.na(close)) {
    return(NULL)
  }

  list(
    meta = rest[seq_len(close - 1L)],
    body = rest[-seq_len(close)]
  )
}

requires_pattern <- function() {
  paste0(
    "^([[:alpha:]][[:alnum:].]*)",
    "(?:[[:space:]]*\\([[:space:]]*",
    "(>=|<=|==|>|<)[[:space:]]*",
    "([[:digit:]][[:alnum:].-]*)[[:space:]]*\\))?$"
  )
}

parse_requires <- function(x, name) {

  specs <- trimws(as.character(x))

  if (!length(specs)) {
    return(list())
  }

  parts <- regmatches(specs, regexec(requires_pattern(), specs, perl = TRUE))
  bad   <- specs[lengths(parts) == 0L]

  if (length(bad)) {
    log_warn(
      "Skill {name} has `requires` entries that are not R dependency ",
      "specifications: {paste(bad, collapse = ', ')}; skipped."
    )
    return(NULL)
  }

  lapply(parts, requires_entry)
}

requires_entry <- function(match) {
  list(pkg = match[[2L]], op = match[[3L]], version = match[[4L]])
}

skill_available <- function(skill) {
  all(lgl_ply(skill$requires, requirement_met))
}

requirement_met <- function(req) {

  installed <- tryCatch(packageVersion(req$pkg), error = function(e) NULL)

  if (is.null(installed)) {
    return(FALSE)
  }

  if (!nzchar(req$op)) {
    return(TRUE)
  }

  do.call(req$op, list(installed, package_version(req$version)))
}

unmet_summary <- function(skill) {

  unmet <- Filter(Negate(requirement_met), skill$requires)

  glue::glue(
    "{skill$name} needs ",
    "{paste(chr_ply(unmet, requires_label), collapse = ', ')}"
  )
}

requires_label <- function(req) {
  paste0(req$pkg, if (nzchar(req$op)) glue::glue(" ({req$op} {req$version})"))
}

read_skill_file <- function(skill, file) {

  lines <- readLines(file.path(skill$path, file), warn = FALSE)

  if (identical(file, "SKILL.md")) {
    lines <- split_frontmatter(lines)$body
  }

  paste(trim_blank_edges(lines), collapse = "\n")
}

skill_body <- function(skill) {
  read_skill_file(skill, "SKILL.md")
}

trim_blank_edges <- function(lines) {

  keep <- which(nzchar(trimws(lines)))

  if (!length(keep)) {
    return(character())
  }

  lines[seq.int(keep[[1L]], keep[[length(keep)]])]
}
