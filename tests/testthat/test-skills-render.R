test_that("only unscoped, model-invocable skills are global", {

  root <- local_skills_dir()

  write_skill(root, "site-wide", c("name: site-wide", "description: Global."))
  write_skill(
    root, "for-blocks",
    c("name: for-blocks", "description: Scoped.", "blocks:", "  - head_block")
  )
  write_skill(
    root, "for-exts",
    c(
      "name: for-exts",
      "description: Scoped.",
      "extensions:",
      "  - assistant_extension"
    )
  )
  write_skill(
    root, "hidden",
    c(
      "name: hidden",
      "description: Playbook.",
      "user-invocable: true",
      "disable-model-invocation: true"
    )
  )

  global <- names(global_skills(skill_catalogue()))

  expect_true("site-wide" %in% global)
  expect_false(any(c("for-blocks", "for-exts", "hidden") %in% global))
})

test_that("scoped skills route to their target and nothing else", {

  root <- local_skills_dir()

  write_skill(
    root, "for-head",
    c("name: for-head", "description: Head only.", "blocks:", "  - head_block")
  )
  write_skill(
    root, "for-asst",
    c(
      "name: for-asst",
      "description: Assistant only.",
      "extensions:",
      "  - assistant_extension"
    )
  )

  expect_named(block_skills("head_block"), "for-head")
  expect_length(block_skills("dataset_block"), 0L)
  expect_named(extension_skills("assistant_extension"), "for-asst")
  expect_length(extension_skills("document_extension"), 0L)
})

test_that("an unresolvable scope key matches no skill", {

  local_skills_dir()

  expect_length(block_skills(character()), 0L)
  expect_length(block_skills(NA_character_), 0L)
})

test_that("the catalogue renders one line per skill", {

  root <- local_skills_dir()

  write_skill(
    root, "alpha", c("name: alpha", "description: The first one.")
  )

  res <- format_skill_catalogue(global_skills(skill_catalogue()))

  expect_match(res, "this prompt wins", fixed = TRUE)
  expect_match(res, "- `alpha`: The first one.", fixed = TRUE)
  expect_match(res, "- `layout`:", fixed = TRUE)
})

test_that("an empty catalogue renders nothing", {
  expect_null(format_skill_catalogue(list()))
})

test_that("a long description is truncated within budget with a hint", {

  root <- local_skills_dir()

  withr::local_options(blockr.assistant_skill_description_max_chars = 120L)

  write_skill(
    root, "verbose",
    c("name: verbose", paste("description:", strrep("word ", 60L)))
  )

  entry <- skill_blurb(skill_catalogue()[["verbose"]])

  expect_lte(nchar(entry), 120L)
  expect_match(entry, "call read_skill(\"verbose\") for the rest", fixed = TRUE)
})

test_that("a description spanning lines folds to one line", {

  root <- local_skills_dir()

  write_skill(
    root, "folded",
    c("name: folded", "description: >-", "  First half", "  second half.")
  )

  expect_identical(
    skill_blurb(skill_catalogue()[["folded"]]), "First half second half."
  )
})

test_that("skill refs and lines carry name and description", {

  root <- local_skills_dir()

  write_skill(
    root, "scoped",
    c("name: scoped", "description: Site rule.", "blocks:", "  - head_block")
  )

  skills <- block_skills("head_block")

  expect_identical(
    skill_refs(skills), list(list(name = "scoped", description = "Site rule."))
  )
  expect_null(skill_refs(list()))

  lines <- skill_lines(skills)

  expect_match(lines[[1L]], "deployment convention")
  expect_identical(lines[[2L]], "  scoped: Site rule.")
  expect_length(skill_lines(list()), 0L)
})
