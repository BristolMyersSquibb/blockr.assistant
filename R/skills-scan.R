skill_cache <- new.env(parent = emptyenv())

# The skills of the app's packages, `packages`, and of the deployment, by
# name, as R lists them from the directories that `skill_sources()` gives.
skill_catalogue <- function(packages) {

  sources <- skill_sources(packages)
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

# The directories that R lists skills from, in this order:
# the `inst/assistant/skills` of each of the app's packages that has one, in
# the order of the packages' names, then the directory that the blockr option
# `assistant_skills` names.
# A package's `inst/skills` is btw's, which lists the skills there for coding
# agents.
skill_sources <- function(packages) {

  if (!is.character(packages) || anyNA(packages) ||
        !all(is_package_name(packages))) {
    blockr_abort(
      "The app's packages are given by their names, in `packages`.",
      class = "invalid_packages"
    )
  }

  pkgs <- sort(unique(packages), method = "radix")
  dirs <- chr_ply(pkgs, package_skills_dir, use_names = FALSE)
  dirs <- dirs[dir.exists(dirs)]

  configured <- blockr_option("assistant_skills", NULL)

  if (is.null(configured)) {
    return(dirs)
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

  c(dirs, configured)
}

package_skills_dir <- function(pkg) {
  system.file("assistant", "skills", package = pkg)
}

skill_dirs <- function(sources) {

  dirs <- unlst(lapply(sources, list.dirs, recursive = FALSE))

  dirs[file.exists(file.path(dirs, "SKILL.md"))]
}

scan_skills <- function(dirs) {

  skills <- list()

  for (skill in Filter(not_null, lapply(dirs, parse_skill))) {

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
      "them to the block classes or plugin classes they bear on."
    )
  }

  invisible()
}

global_skills <- function(skills) {
  Filter(is_global_skill, skills)
}

is_global_skill <- function(skill) {
  is_model_invocable(skill) &&
    !length(skill$blocks) && !length(skill$plugins)
}

is_model_invocable <- function(skill) {
  isTRUE(skill$model_invocable)
}

skill_entry <- function(skill) {
  paste0("- `", skill$name, "`: ", skill_blurb(skill))
}

skill_blurb <- function(skill) {
  truncate_chars(
    gsub("\\s+", " ", skill$description),
    skill_description_max_chars(),
    paste0("call read_skill(\"", skill$name, "\") for the rest")
  )
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
  blocks   <- parse_classes(meta[["blocks"]], "blocks", name, nullable = TRUE)
  plugins  <- parse_classes(meta[["plugins"]], "plugins", name)

  if (is.null(requires) || is.null(blocks) || is.null(plugins)) {
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
    blocks          = blocks,
    plugins         = plugins,
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

# The classes that a skill names in `blocks:` or `plugins:`, `x`, each a
# mapping of the package that defines the class and the class's id within the
# package, as `{package: blockr.core, id: subset_block}`.
# Only `blocks:` may give a package of null, for a block class that an app
# script defines.
# It gives an empty list where the skill names none, and `NULL`, with a
# warning, where an entry is no such mapping, so that the skill is skipped.
parse_classes <- function(x, key, name, nullable = FALSE) {

  if (is.null(x)) {
    return(list())
  }

  if (!is.list(x) || !is.null(names(x)) ||
        !all(lgl_ply(x, is_class_entry, nullable = nullable))) {
    log_warn(
      "Skill {name} has `{key}` entries that are not mappings of a ",
      "`package` and an `id`; skipped."
    )
    return(NULL)
  }

  lapply(x, `[`, c("package", "id"))
}

# Whether `x` is a mapping of exactly a `package`, a package's name, and an
# `id`, a non-empty string, as a skill names a class. The package may be
# `NULL` where `nullable` is `TRUE`.
is_class_entry <- function(x, nullable) {

  if (!is.list(x) || length(x) != 2L ||
        !setequal(names(x), c("package", "id"))) {
    return(FALSE)
  }

  pkg <- x[["package"]]

  pkg_ok <- if (is.null(pkg)) {
    nullable
  } else {
    is_string(pkg) && is_package_name(pkg)
  }

  pkg_ok && is_string(x[["id"]]) && nzchar(x[["id"]])
}

# Whether each element of `x` is a string that names a package as R names
# one: letters, digits and dots, starting with a letter and ending with no
# dot, as core reads the package of an id.
is_package_name <- function(x) {
  is.character(x) & grepl("^[A-Za-z][A-Za-z0-9.]*[A-Za-z0-9]$", x)
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

  paste0(
    skill$name, " needs ",
    paste(chr_ply(unmet, requires_label), collapse = ", ")
  )
}

requires_label <- function(req) {
  paste0(
    req$pkg,
    if (nzchar(req$op)) paste0(" (", req$op, " ", req$version, ")")
  )
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
