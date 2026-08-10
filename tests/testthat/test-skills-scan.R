test_that("a well-formed skill is parsed into the catalogue", {

  root <- local_skills_dir()

  write_skill(
    root, "adam-exposure",
    c(
      "name: adam-exposure",
      "description: Site convention for exposure tables.",
      "blocks:",
      "  - dataset_block"
    ),
    body = "Always filter to SAFFL."
  )

  skill <- skill_catalogue()[["adam-exposure"]]

  expect_type(skill, "list")
  expect_identical(skill$description, "Site convention for exposure tables.")
  expect_identical(skill$blocks, "dataset_block")
  expect_identical(skill$extensions, character())
  expect_false(skill$user_invocable)
  expect_true(skill$model_invocable)
  expect_identical(skill_body(skill), "Always filter to SAFFL.")
})

test_that("the package ships the layout skill as a global skill", {

  layout <- skill_catalogue()[["layout"]]

  expect_type(layout, "list")
  expect_true(is_global_skill(layout))
  expect_true(layout$user_invocable)
  expect_match(skill_body(layout), "Views are tabs")
  expect_match(skill_body(layout), "orientation")
})

test_that("a skill without frontmatter is skipped with a warning", {

  root <- local_skills_dir()

  dir.create(file.path(root, "bare"))
  writeLines("Just a body.", file.path(root, "bare", "SKILL.md"))

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "has no YAML frontmatter; skipped")
  expect_false("bare" %in% names(skills))
})

test_that("malformed frontmatter is skipped with a warning", {

  root <- local_skills_dir()

  write_skill(root, "broken", c("name: broken", "description: [unclosed"))

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "has malformed frontmatter")
  expect_false("broken" %in% names(skills))
})

test_that("a missing description is skipped with a warning", {

  root <- local_skills_dir()

  write_skill(root, "nameless", "name: nameless")

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "needs a `name` and a non-empty `description`")
  expect_false("nameless" %in% names(skills))
})

test_that("a name not matching its directory is skipped with a warning", {

  root <- local_skills_dir()

  write_skill(
    root, "on-disk", c("name: in-frontmatter", "description: Mismatched.")
  )

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "does not match its directory on-disk")
  expect_false("in-frontmatter" %in% names(skills))
})

test_that("a name outside the allowed charset is skipped with a warning", {

  root <- local_skills_dir()

  write_skill(root, "Shouty", c("name: Shouty", "description: Bad charset."))

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "may only hold lowercase letters")
  expect_false("Shouty" %in% names(skills))
})

test_that("a directory without SKILL.md is not a skill", {

  root <- local_skills_dir()

  dir.create(file.path(root, "notes"))
  writeLines("scratch", file.path(root, "notes", "README.md"))

  expect_silent(skills <- skill_catalogue())
  expect_false("notes" %in% names(skills))
})

test_that("allowed-tools is warned about and ignored", {

  root <- local_skills_dir()

  write_skill(
    root, "restricted",
    c(
      "name: restricted",
      "description: Sets allowed-tools.",
      "allowed-tools:",
      "  - add_view"
    )
  )

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "which the assistant does not honour")
  expect_true("restricted" %in% names(skills))
})

test_that("unknown frontmatter fields are ignored without complaint", {

  root <- local_skills_dir()

  write_skill(
    root, "forward",
    c(
      "name: forward",
      "description: Carries fields we do not know.",
      "license: MIT",
      "metadata:",
      "  author: someone",
      "future-field: 42"
    )
  )

  expect_silent(skills <- skill_catalogue())
  expect_true("forward" %in% names(skills))
})

test_that("a skill unreachable by model or user is warned about", {

  root <- local_skills_dir()

  write_skill(
    root, "orphan",
    c(
      "name: orphan",
      "description: Reachable by nothing.",
      "disable-model-invocation: true"
    )
  )

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "so nothing can reach it")
  expect_true("orphan" %in% names(skills))
})

test_that("an unmet requirement makes a skill absent from the catalogue", {

  root <- local_skills_dir()

  write_skill(
    root, "gated",
    c(
      "name: gated",
      "description: Needs a package that is not installed.",
      "requires:",
      "  - notAnInstalledPackage (>= 1.0)"
    )
  )

  expect_false("gated" %in% names(skill_catalogue()))
})

test_that("a met requirement leaves a skill in the catalogue", {

  root <- local_skills_dir()

  write_skill(
    root, "supported",
    c(
      "name: supported",
      "description: Needs a package that is installed.",
      "requires:",
      "  - blockr.core (>= 0.1.0)",
      "  - ellmer"
    )
  )

  expect_true("supported" %in% names(skill_catalogue()))
})

test_that("a version constraint that fails filters the skill out", {

  root <- local_skills_dir()

  write_skill(
    root, "toonew",
    c(
      "name: toonew",
      "description: Needs an impossible version.",
      "requires:",
      "  - blockr.core (>= 99.0.0)"
    )
  )

  expect_false("toonew" %in% names(skill_catalogue()))
})

test_that("an unparseable requirement skips the skill with a warning", {

  root <- local_skills_dir()

  write_skill(
    root, "garbled",
    c(
      "name: garbled",
      "description: Malformed constraint.",
      "requires:",
      "  - blockr.core >= 0.1.0"
    )
  )

  logs <- capture_logs(skills <- skill_catalogue())

  expect_match(logs, "not R dependency specifications")
  expect_false("garbled" %in% names(skills))
})

test_that("a deployment skill shadows a built-in of the same name", {

  root <- local_skills_dir()

  write_skill(
    root, "layout",
    c("name: layout", "description: Site layout rules."),
    body = "Panels go on the left."
  )

  layout <- skill_catalogue()[["layout"]]

  expect_identical(layout$description, "Site layout rules.")
  expect_identical(skill_body(layout), "Panels go on the left.")
})

test_that("a configured skills directory that is missing errors", {

  withr::local_options(
    blockr.assistant_skills = file.path(tempdir(), "no-such-skills")
  )

  expect_error(skill_catalogue(), class = "missing_skills_dir")
})

test_that("a non-scalar skills directory errors", {

  withr::local_options(blockr.assistant_skills = c("a", "b"))

  expect_error(skill_catalogue(), class = "invalid_skills_option")
})

test_that("an edited skill is picked up without a restart", {

  root <- local_skills_dir()

  path <- write_skill(
    root, "evolving", c("name: evolving", "description: First take."),
    body = "First body."
  )

  expect_identical(
    skill_catalogue()[["evolving"]]$description, "First take."
  )

  write_skill(
    root, "evolving", c("name: evolving", "description: Second take."),
    body = "Second body."
  )
  Sys.setFileTime(file.path(path, "SKILL.md"), Sys.time() + 2)

  expect_identical(
    skill_catalogue()[["evolving"]]$description, "Second take."
  )
  expect_identical(
    skill_body(skill_catalogue()[["evolving"]]), "Second body."
  )
})

test_that("frontmatter delimiters inside the body are left alone", {

  root <- local_skills_dir()

  write_skill(
    root, "ruled", c("name: ruled", "description: Has a horizontal rule."),
    body = c("Above.", "", "---", "", "Below.")
  )

  expect_identical(
    skill_body(skill_catalogue()[["ruled"]]),
    "Above.\n\n---\n\nBelow."
  )
})

test_that("an always-on catalogue over budget is warned about", {

  root <- local_skills_dir()

  # The package's own layout skill is global too, so budget from what the
  # catalogue already costs rather than from a bare number.
  withr::local_options(
    blockr.assistant_skill_catalogue_max_chars = catalogue_chars() + 100L
  )

  for (nme in c("alpha", "beta", "gamma")) {
    write_skill(
      root, nme,
      c(sprintf("name: %s", nme), paste("description:", strrep("word ", 30L)))
    )
  }

  logs <- capture_logs(skill_catalogue())

  expect_match(logs, "always-on skill catalogue is")
  expect_match(logs, "trim the descriptions of the 4 global skills")
})

test_that("scoped skills do not count against the always-on budget", {

  root <- local_skills_dir()

  withr::local_options(
    blockr.assistant_skill_catalogue_max_chars = catalogue_chars() + 100L
  )

  for (nme in c("alpha", "beta", "gamma")) {
    write_skill(
      root, nme,
      c(
        sprintf("name: %s", nme),
        paste("description:", strrep("word ", 30L)),
        "blocks:",
        "  - head_block"
      )
    )
  }

  expect_no_match(capture_logs(skill_catalogue()), "over the")
})
