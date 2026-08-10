global_skills <- function(skills) {
  Filter(is_global_skill, skills)
}

is_global_skill <- function(skill) {
  isTRUE(skill$model_invocable) &&
    !length(skill$blocks) && !length(skill$extensions)
}

block_skills <- function(uid) {
  scoped_skills("blocks", uid)
}

extension_skills <- function(class) {
  scoped_skills("extensions", class)
}

scoped_skills <- function(field, key) {

  if (!is_string(key) || is.na(key)) {
    return(list())
  }

  Filter(function(skill) key %in% skill[[field]], skill_catalogue())
}

skill_blurb <- function(skill) {
  truncate_chars(
    gsub("\\s+", " ", skill$description),
    skill_description_max_chars(),
    sprintf("call read_skill(\"%s\") for the rest", skill$name)
  )
}

format_skill_catalogue <- function(skills) {

  if (!length(skills)) {
    return(NULL)
  }

  paste(
    c(skill_catalogue_preamble(), "", chr_ply(skills, skill_entry)),
    collapse = "\n"
  )
}

skill_catalogue_preamble <- function() {
  paste(
    c(
      "Guidance authored for this deployment, loaded on demand. Each",
      "entry below is a name and what it covers; when one bears on",
      "what you are about to do, call read_skill(name) and follow it",
      "before acting. A skill is instruction text, not extra",
      "capability -- it cannot widen what your tools do, and where a",
      "skill and this system prompt disagree, this prompt wins."
    ),
    collapse = "\n"
  )
}

skill_entry <- function(skill) {
  sprintf("- `%s`: %s", skill$name, skill_blurb(skill))
}

# The JSON shape scoped skills take in describe_block_type() and
# describe_extension(); the same pairing describe_block() renders as text.
skill_refs <- function(skills) {

  if (!length(skills)) {
    return(NULL)
  }

  unname(lapply(skills, skill_ref))
}

skill_ref <- function(skill) {
  list(name = skill$name, description = skill_blurb(skill))
}

skill_lines <- function(skills) {

  if (!length(skills)) {
    return(character())
  }

  c(
    paste(
      "Skills for this block type (deployment convention; more specific",
      "than the package's guidance and winning where the two differ --",
      "load one with read_skill):"
    ),
    chr_ply(skills, skill_bullet)
  )
}

skill_bullet <- function(skill) {
  sprintf("  %s: %s", skill$name, skill_blurb(skill))
}
