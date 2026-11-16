# Call the assistant's request `.request` as core calls a plugin's request:
# with the plugin's args in `...` by name, each of which the request's function
# has to take, and with the blocks that it reads in `reads` and the app's
# packages in `packages`, where the function takes them.
call_request <- function(.request, ..., reads = list(),
                         packages = character()) {

  fun <- plugin_requests(new_assistant_plugin())[[.request]]
  args <- list(...)
  bound <- list(reads = reads, packages = packages)
  fmls <- names(formals(fun))

  stopifnot(all(names(args) %in% setdiff(fmls, names(bound))))

  do.call(fun, c(args, bound[intersect(names(bound), fmls)]), quote = TRUE)
}

# A block that a request reads, as core hands it: its result and its block
# expression.
block_read <- function(result, expr = quote(x)) {
  list(result = result, expr = expr)
}

# Give each of the packages `pkgs` a directory that R reads as the package's
# `inst/assistant/skills`, for the calling test, and return them by package.
local_package_skills <- function(pkgs, .local_envir = parent.frame()) {

  root <- withr::local_tempdir(.local_envir = .local_envir)
  dirs <- set_names(file.path(root, pkgs), pkgs)

  for (dir in dirs) {
    dir.create(dir)
  }

  testthat::local_mocked_bindings(
    package_skills_dir = function(pkg) {
      if (pkg %in% names(dirs)) dirs[[pkg]] else ""
    },
    .env = .local_envir
  )

  dirs
}

# The width and height of a PNG, from its header.
png_size <- function(png) {

  int <- function(bytes) sum(as.integer(bytes) * 256^(3:0))

  c(int(png[17:20]), int(png[21:24]))
}
