test_that("read_skill returns the body with frontmatter stripped", {

  root <- local_skills_dir()

  write_skill(
    root, "conventions",
    c("name: conventions", "description: House style."),
    body = c("# Conventions", "", "Prefer long format.")
  )

  res <- tool_read_skill()("conventions")

  expect_identical(res, "# Conventions\n\nPrefer long format.")
  expect_no_match(res, "description:", fixed = TRUE)
})

test_that("read_skill returns a bundled file verbatim", {

  root <- local_skills_dir()

  path <- write_skill(
    root, "bundled", c("name: bundled", "description: Has a resource.")
  )
  writeLines(c("col,meaning", "SAFFL,safety flag"),
             file.path(path, "columns.csv"))

  expect_identical(
    tool_read_skill()("bundled", "columns.csv"),
    "col,meaning\nSAFFL,safety flag"
  )
})

test_that("read_skill refuses a file outside the skill directory", {

  root <- local_skills_dir()

  write_skill(root, "one", c("name: one", "description: First."))
  write_skill(root, "two", c("name: two", "description: Second."))

  res <- tool_read_skill()("one", "../two/SKILL.md")

  expect_match(res, "bundles no file", fixed = TRUE)
  expect_no_match(res, "Second", fixed = TRUE)
})

test_that("read_skill refuses a skill whose requirements are unmet", {

  root <- local_skills_dir()

  write_skill(
    root, "gated",
    c(
      "name: gated",
      "description: Needs a missing package.",
      "requires:",
      "  - notAnInstalledPackage"
    ),
    body = "Secret instructions."
  )

  res <- tool_read_skill()("gated")

  expect_match(res, "No skill named 'gated' is available here", fixed = TRUE)
  expect_no_match(res, "Secret instructions", fixed = TRUE)
})

test_that("read_skill reports an unknown name", {

  local_skills_dir()

  expect_match(
    tool_read_skill()("nope"), "No skill named 'nope'", fixed = TRUE
  )
})

test_that("read_skill is registered when the catalogue holds skills", {

  local_skills_dir()

  client <- fake_chat_function()
  register_skill_tools(client)

  expect_true("read_skill" %in% names(client$get_tools()))
})

test_that("an empty catalogue registers no read_skill tool", {

  local_mocked_bindings(skill_catalogue = function() list())

  client <- fake_chat_function()
  register_skill_tools(client)

  expect_length(client$get_tools(), 0L)
})

test_that("only user-invocable skills become slash commands", {

  root <- local_skills_dir()

  write_skill(
    root, "playbook",
    c("name: playbook", "description: Run the drill.", "user-invocable: true")
  )
  write_skill(
    root, "model-only", c("name: model-only", "description: Not a command.")
  )

  registered <- list()

  mod <- list(
    slash_command = function(name, description, handler) {
      registered[[name]] <<- list(description = description, handler = handler)
      invisible()
    }
  )

  register_skill_commands(mod, function(skill, content) skill$name)

  expect_setequal(names(registered), c("layout", "playbook"))
  expect_identical(registered$playbook$description, "Run the drill.")
})

test_that("a slash command that shinychat rejects is logged, not fatal", {

  root <- local_skills_dir()

  write_skill(
    root, "taken",
    c("name: taken", "description: Collides.", "user-invocable: true")
  )

  mod <- list(
    slash_command = function(name, description, handler) {
      if (identical(name, "taken")) {
        stop("Slash command \"taken\" is already registered.")
      }
      invisible()
    }
  )

  logs <- capture_logs(register_skill_commands(mod, function(...) NULL))

  expect_match(logs, "Slash command /taken was not registered")
})

test_that("each slash handler is bound to its own skill", {

  root <- local_skills_dir()

  write_skill(
    root, "first",
    c("name: first", "description: One.", "user-invocable: true")
  )
  write_skill(
    root, "second",
    c("name: second", "description: Two.", "user-invocable: true")
  )

  handlers <- list()

  mod <- list(
    slash_command = function(name, description, handler) {
      handlers[[name]] <<- handler
      invisible()
    }
  )

  register_skill_commands(mod, function(skill, content) skill$name)

  expect_identical(handlers$first(NULL), "first")
  expect_identical(handlers$second(NULL), "second")
})

test_that("the slash prompt carries the body and the user's text", {

  root <- local_skills_dir()

  write_skill(
    root, "drill",
    c("name: drill", "description: A drill.", "user-invocable: true"),
    body = "Step one, then step two."
  )

  skill <- skill_catalogue()[["drill"]]

  with_text <- skill_command_prompt(skill, "on the iris board")

  expect_match(with_text, "invoked the `drill` skill", fixed = TRUE)
  expect_match(with_text, "Step one, then step two.", fixed = TRUE)
  expect_match(with_text, "The user's request: on the iris board", fixed = TRUE)

  expect_no_match(
    skill_command_prompt(skill, ""), "The user's request", fixed = TRUE
  )
})
