test_that("the assistant's class gives its six requests", {

  reqs <- plugin_requests(new_assistant_plugin())

  expect_named(
    reqs,
    c(
      "describe_result", "inspect_results", "list_skills", "read_skill",
      "read_template", "read_model_settings"
    )
  )
  expect_true(all(lgl_ply(reqs, is.function)))
})

test_that("describe_result gives each block's summary by block id", {

  res <- call_request(
    "describe_result",
    reads = list(a = block_read(datasets::BOD), b = block_read(letters))
  )

  expect_named(res, c("a", "b"))
  expect_identical(res$a, summarise_result(datasets::BOD))
  expect_identical(res$b, summarise_result(letters))
})

test_that("describe_result catches a failing method and cuts at the cap", {

  registerS3method(
    "describe_result", "assistant_failing_result",
    function(x, ...) stop("cannot describe")
  )

  withr::local_options(blockr.assistant_summary_max_chars = 100L)

  res <- call_request(
    "describe_result",
    reads = list(
      a = block_read(structure(1L, class = "assistant_failing_result")),
      b = block_read(strrep("z", 5000L))
    )
  )

  expect_match(res$a, "cannot describe", fixed = TRUE)
  expect_lte(nchar(res$b), 100L)
})

test_that("describe_result answers a request that reads no block", {

  res <- call_request("describe_result")

  expect_length(res, 0L)
  expect_identical(names(res), character())
})

test_that("a captured plot is described without being drawn", {

  plt <- capture_plot(quote(graphics::plot(1:3)), new.env())
  before <- grDevices::dev.list()

  res <- call_request("describe_result", reads = list(a = block_read(plt)))

  expect_identical(res$a, "Captured plot (`captured_plot`).")
  expect_identical(grDevices::dev.list(), before)
})

test_that("inspect_results prints the last value, with results bound by id", {

  res <- call_request(
    "inspect_results",
    code = "x <- nrow(a)\nx + nrow(b)",
    reads = list(a = block_read(datasets::BOD), b = block_read(datasets::iris))
  )

  expect_identical(res$output, "[1] 156")
  expect_identical(res$plots, character())
})

test_that("inspect_results prints nothing for an invisible value", {

  res <- call_request("inspect_results", code = "x <- 1")

  expect_identical(res$output, "")
})

test_that("inspect_results runs the code where only base R is attached", {

  res <- call_request("inspect_results", code = "exists('median')")

  expect_identical(res$output, "[1] FALSE")
})

test_that("inspect_results gives a plot as a base64 PNG of the size asked", {

  res <- call_request(
    "inspect_results",
    code = "graphics::plot(1:3)",
    width = 300L,
    height = 250L
  )

  expect_length(res$plots, 1L)

  png <- base64enc::base64decode(res$plots)

  expect_identical(png[2:4], charToRaw("PNG"))
  expect_identical(png_size(png), c(300, 250))
})

test_that("inspect_results takes the default size and clamps to the range", {

  res <- call_request(
    "inspect_results",
    code = "graphics::plot(1:3)",
    width = 50L
  )

  png <- base64enc::base64decode(res$plots)

  expect_identical(png_size(png), c(200, 768))
})

test_that("inspect_results draws a captured plot that the code prints", {

  plt <- capture_plot(quote(graphics::plot(1:3)), new.env())

  res <- call_request(
    "inspect_results",
    code = "chart",
    reads = list(chart = block_read(plt))
  )

  expect_length(res$plots, 1L)
})

test_that("inspect_results gives no more plots than the cap, and says so", {

  withr::local_options(blockr.assistant_plot_render_max = 2L)

  res <- call_request(
    "inspect_results",
    code = "for (i in 1:3) graphics::plot(i)"
  )

  expect_length(res$plots, 2L)
  expect_match(res$output, "Returned 2 of 3 drawn plots", fixed = TRUE)
})

test_that("inspect_results cuts what the code prints at the cap", {

  withr::local_options(blockr.assistant_eval_max_chars = 1000L)

  res <- call_request("inspect_results", code = "print(1:5000)")

  expect_lte(nchar(res$output), 1000L)
  expect_match(res$output, "the output is incomplete", fixed = TRUE)
})

test_that("inspect_results raises the error of the model's code", {

  before <- grDevices::dev.list()

  expect_error(call_request("inspect_results", code = "stop('boom')"), "boom")
  expect_identical(grDevices::dev.list(), before)
})

test_that("inspect_results refuses on a locked board", {

  withr::local_options(blockr.locked = TRUE)

  expect_error(
    call_request("inspect_results", code = "1 + 1"),
    class = "locked_board"
  )
})

test_that("inspect_results reads the lock of an environment variable", {

  withr::local_envvar(BLOCKR_LOCKED = "true")

  expect_error(
    call_request("inspect_results", code = "1 + 1"),
    class = "locked_board"
  )
})

test_that("inspect_results takes its code as one string", {

  expect_error(
    call_request("inspect_results", code = c("1", "2")),
    class = "invalid_inspect_code"
  )
})

test_that("list_skills gives each skill with its classes and flags", {

  root <- local_skills_dir()

  write_skill(
    root, "exposure",
    c(
      "name: exposure",
      "description: Exposure tables.",
      "blocks:",
      "  - blockr.core-dataset_block",
      "plugins:",
      "  - blockr.dock-dock_plugin",
      "user-invocable: true",
      "disable-model-invocation: true"
    )
  )

  expect_identical(
    call_request("list_skills"),
    list(
      list(
        name = "exposure",
        description = "Exposure tables.",
        blocks = "blockr.core-dataset_block",
        plugins = "blockr.dock-dock_plugin",
        `user-invocable` = TRUE,
        `disable-model-invocation` = TRUE
      )
    )
  )
})

test_that("list_skills lists packages' skills by name, then the site's", {

  dirs <- local_package_skills(c("pkgb", "pkga", "pkgc"))

  write_skill(dirs[["pkgb"]], "beta", c("name: beta", "description: B."))
  write_skill(dirs[["pkga"]], "alpha", c("name: alpha", "description: A."))
  write_skill(dirs[["pkgc"]], "delta", c("name: delta", "description: C."))

  root <- local_skills_dir()

  write_skill(root, "gamma", c("name: gamma", "description: The site's."))

  res <- call_request("list_skills", packages = c("pkgb", "pkga"))

  expect_identical(chr_xtr(res, "name"), c("alpha", "beta", "gamma"))
})

test_that("a deployment's skill takes the place of a package's, as R logs", {

  dirs <- local_package_skills("pkga")

  write_skill(dirs[["pkga"]], "layout", c("name: layout", "description: Pkg."))

  root <- local_skills_dir()

  write_skill(root, "layout", c("name: layout", "description: Site."))

  logs <- capture_logs(
    res <- call_request("list_skills", packages = "pkga")
  )

  expect_identical(chr_xtr(res, "description"), "Site.")
  expect_match(logs, "shadows the one at", fixed = TRUE)
})

test_that("list_skills reads no package's inst/skills", {

  withr::local_options(blockr.assistant_skills = NULL)
  withr::local_envvar(BLOCKR_ASSISTANT_SKILLS = NA)

  expect_identical(
    call_request("list_skills", packages = c("blockr.core", "btw")),
    list()
  )
})

test_that("list_skills takes packages by their names", {

  expect_error(
    call_request("list_skills", packages = "../skills"),
    class = "invalid_packages"
  )
})

test_that("read_skill gives a skill's text without its frontmatter", {

  root <- local_skills_dir()

  write_skill(
    root, "exposure", c("name: exposure", "description: Exposure tables."),
    body = "Always filter to SAFFL."
  )

  expect_identical(
    call_request("read_skill", name = "exposure"),
    "Always filter to SAFFL."
  )
})

test_that("read_skill gives a skill of the app's packages", {

  dirs <- local_package_skills("pkga")

  write_skill(
    dirs[["pkga"]], "alpha", c("name: alpha", "description: Of pkga."),
    body = "From the package."
  )

  expect_identical(
    call_request("read_skill", name = "alpha", packages = "pkga"),
    "From the package."
  )
})

test_that("read_skill gives a file that the skill bundles", {

  root <- local_skills_dir()

  path <- write_skill(
    root, "exposure", c("name: exposure", "description: Exposure tables.")
  )

  dir.create(file.path(path, "refs"))
  writeLines("Domain notes.", file.path(path, "refs", "notes.md"))

  expect_identical(
    call_request("read_skill", name = "exposure", path = "refs/notes.md"),
    "Domain notes."
  )
})

test_that("read_skill refuses a file that the skill does not bundle", {

  root <- local_skills_dir()

  write_skill(
    root, "exposure", c("name: exposure", "description: Exposure tables.")
  )

  expect_error(
    call_request("read_skill", name = "exposure", path = "../other/SKILL.md"),
    "It bundles: SKILL.md.",
    fixed = TRUE,
    class = "unbundled_skill_file"
  )
})

test_that("read_skill reads a skill that the model may not read", {

  root <- local_skills_dir()

  write_skill(
    root, "handover",
    c(
      "name: handover",
      "description: Run by the user.",
      "user-invocable: true",
      "disable-model-invocation: true"
    ),
    body = "Summarise the board."
  )

  expect_identical(
    call_request("read_skill", name = "handover"),
    "Summarise the board."
  )
})

test_that("read_skill refuses a skill that R does not list", {

  local_skills_dir()

  expect_error(
    call_request("read_skill", name = "missing"),
    "No skill named missing",
    class = "unknown_skill"
  )
})

test_that("read_skill takes a skill's name as one string", {

  root <- local_skills_dir()

  write_skill(root, "exposure", c("name: exposure", "description: Tables."))

  expect_error(
    call_request("read_skill", name = 1L),
    class = "invalid_skill_name"
  )
})

test_that("read_template gives nothing where the option names no file", {

  withr::local_options(blockr.assistant_template = NULL)
  withr::local_envvar(BLOCKR_ASSISTANT_TEMPLATE = NA)

  expect_null(call_request("read_template"))
})

test_that("read_template gives the text of the file that the option names", {

  path <- withr::local_tempfile(fileext = ".md")
  writeLines(c("# Our assistant", "", "<<edits>>"), path)

  withr::local_options(blockr.assistant_template = path)

  expect_identical(
    call_request("read_template"),
    "# Our assistant\n\n<<edits>>"
  )
})

test_that("read_template fails where R cannot read the file", {

  path <- file.path(withr::local_tempdir(), "missing.md")

  withr::local_options(blockr.assistant_template = path)

  expect_error(
    call_request("read_template"),
    "R cannot read the template",
    class = "unreadable_template"
  )
})

test_that("read_template takes one file", {

  withr::local_options(blockr.assistant_template = c("a.md", "b.md"))

  expect_error(
    call_request("read_template"),
    class = "invalid_template_option"
  )
})

test_that("read_model_settings gives nothing where the option names no file", {

  withr::local_options(blockr.assistant_model_settings = NULL)
  withr::local_envvar(BLOCKR_ASSISTANT_MODEL_SETTINGS = NA)

  expect_null(call_request("read_model_settings"))
})

test_that("read_model_settings gives what the file holds, as YAML parses it", {

  path <- withr::local_tempfile(fileext = ".yml")
  writeLines(
    c(
      "corp-claude:",
      "  like: claude-sonnet-5-5",
      "corp-gpt:",
      "  reasoning: true",
      "  images: false",
      "  context_window: 200000",
      "  max_tokens: 32000"
    ),
    path
  )

  withr::local_options(blockr.assistant_model_settings = path)

  expect_identical(
    call_request("read_model_settings"),
    list(
      `corp-claude` = list(like = "claude-sonnet-5-5"),
      `corp-gpt` = list(
        reasoning = TRUE,
        images = FALSE,
        context_window = 200000L,
        max_tokens = 32000L
      )
    )
  )
})

test_that("read_model_settings reads only true and false as booleans", {

  path <- withr::local_tempfile(fileext = ".yml")
  writeLines(
    c(
      "corp-gpt:",
      "  reasoning: True",
      "  images: FALSE",
      "  thinking_level: off",
      "corp-mini:",
      "  reasoning: yes",
      "  thinking_level: \"off\""
    ),
    path
  )

  withr::local_options(blockr.assistant_model_settings = path)

  expect_identical(
    call_request("read_model_settings"),
    list(
      `corp-gpt` = list(
        reasoning = TRUE,
        images = FALSE,
        thinking_level = "off"
      ),
      `corp-mini` = list(reasoning = "yes", thinking_level = "off")
    )
  )
})

test_that("read_model_settings reads the file of the environment variable", {

  path <- withr::local_tempfile(fileext = ".yml")
  writeLines(c("corp-gpt:", "  images: false"), path)

  withr::local_options(blockr.assistant_model_settings = NULL)
  withr::local_envvar(BLOCKR_ASSISTANT_MODEL_SETTINGS = path)

  expect_identical(
    call_request("read_model_settings"),
    list(`corp-gpt` = list(images = FALSE))
  )
})

test_that("read_model_settings fails where R cannot read the file", {

  path <- file.path(withr::local_tempdir(), "missing.yml")

  withr::local_options(blockr.assistant_model_settings = path)

  expect_error(
    call_request("read_model_settings"),
    "R cannot read the model settings",
    class = "unreadable_model_settings"
  )
})

test_that("read_model_settings fails where the file holds no YAML", {

  path <- withr::local_tempfile(fileext = ".yml")
  writeLines(c("corp-gpt:", "  reasoning: [true"), path)

  withr::local_options(blockr.assistant_model_settings = path)

  expect_error(
    call_request("read_model_settings"),
    "R cannot read the model settings",
    class = "unreadable_model_settings"
  )
})

test_that("read_model_settings takes one file", {

  withr::local_options(blockr.assistant_model_settings = c("a.yml", "b.yml"))

  expect_error(
    call_request("read_model_settings"),
    class = "invalid_model_settings_option"
  )
})
