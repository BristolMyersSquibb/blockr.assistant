test_that("an ellmer tool serialises to an MCP tool", {
  tl <- ellmer::tool(
    function(id, n = 5) id, "Read a thing",
    name = "read_thing",
    arguments = list(
      id = ellmer::type_string("Block id."),
      n = ellmer::type_integer("Rows.", required = FALSE)
    )
  )
  js <- tool_as_json(tl)
  expect_equal(js$name, "read_thing")
  expect_equal(js$description, "Read a thing")
  expect_equal(js$inputSchema$type, "object")
  expect_setequal(names(js$inputSchema$properties), c("id", "n"))
  expect_equal(unlist(js$inputSchema$required), "id")
})

test_that("arguments are converted by the tool's declared types", {
  tl <- ellmer::tool(
    function(rows, ids) paste(nrow(rows), length(ids)), "Typed",
    name = "typed",
    arguments = list(
      rows = ellmer::type_array(ellmer::type_object(
        k = ellmer::type_string(), v = ellmer::type_number()
      )),
      ids = ellmer::type_array(ellmer::type_string())
    )
  )
  kit <- list(
    tools = function() list(typed = tl),
    summary = function() "",
    instructions = function() ""
  )
  req <- list(
    REQUEST_METHOD = "POST",
    rook.input = list(read = function(n) charToRaw(
      '{"name":"typed","arguments":{"rows":[{"k":"a","v":1},{"k":"b","v":2}],"ids":["x","y","z"]}}'
    ))
  )
  out <- jsonlite::fromJSON(handle_request(kit, req)$content)
  expect_false(out$isError)
  expect_equal(out$content$text, "2 3")
})

test_that("results take MCP's tools/call shape", {
  ok <- call_result("done")
  expect_false(ok$isError)
  expect_equal(ok$content[[1]]$text, "done")
  bad <- call_result(structure("boom", class = "tool_error"))
  expect_true(bad$isError)
  expect_equal(bad$content[[1]]$text, "boom")
})

test_that("the endpoint answers GET, POST and everything else", {
  tl <- ellmer::tool(
    function(x) paste("got", x), "Echo", name = "echo",
    arguments = list(x = ellmer::type_string())
  )
  kit <- list(
    tools = function() list(echo = tl),
    summary = function() "empty",
    instructions = function() "Work the board like so."
  )

  get <- handle_request(kit, list(REQUEST_METHOD = "GET"))
  expect_equal(get$status, 200L)
  body <- jsonlite::fromJSON(get$content, simplifyVector = FALSE)
  expect_equal(body$tools[[1]]$name, "echo")
  expect_equal(body$board, "empty")
  expect_equal(body$instructions, "Work the board like so.")

  post_req <- function(json) list(
    REQUEST_METHOD = "POST",
    rook.input = list(read = function(n) charToRaw(json))
  )
  post <- handle_request(kit, post_req('{"name":"echo","arguments":{"x":"hi"}}'))
  expect_equal(post$status, 200L)
  expect_equal(
    jsonlite::fromJSON(post$content)$content$text, "got hi"
  )

  expect_equal(
    handle_request(kit, post_req('{"name":"nope","arguments":{}}'))$status, 404L
  )
  expect_equal(handle_request(kit, post_req("{oops"))$status, 400L)
  expect_equal(handle_request(kit, list(REQUEST_METHOD = "PUT"))$status, 405L)
})

test_that("only the routing cookies are published", {
  sess <- list(request = list(
    HTTP_COOKIE = "rsc-job-abc=secret; AWSALB=pin1; other=x; AWSALBCORS=pin2"
  ))
  expect_equal(affinity_cookie(sess), "AWSALB=pin1; AWSALBCORS=pin2")

  # The header the user's session carries must never travel whole: it holds
  # their session with the server alongside the load balancer's routing token.
  expect_no_match(affinity_cookie(sess), "rsc-job", fixed = TRUE)
  expect_no_match(affinity_cookie(sess), "other", fixed = TRUE)

  expect_equal(affinity_cookie(list(request = list(HTTP_COOKIE = NULL))), "")
  expect_equal(
    affinity_cookie(sess, names = "AWSALB"), "AWSALB=pin1"
  )
})

test_that("a connection string carries the address and the pin, and nothing else", {
  tok <- connection_token("https://connect/x/dataobj/a?w=1", "AWSALB=pin")
  back <- jsonlite::fromJSON(rawToChar(jsonlite::base64_dec(tok)))
  expect_equal(back$url, "https://connect/x/dataobj/a?w=1")
  expect_equal(back$cookie, "AWSALB=pin")
  expect_setequal(names(back), c("url", "cookie"))
})

test_that("the connection string is a single line", {
  # base64_enc wraps at 72 chars; a wrapped token is refused as an HTTP header
  # value, so a long URL would break the facade and a short one would not.
  long <- paste0("https://connect.example.com/content/",
                 strrep("a", 120), "/session/", strrep("b", 40),
                 "/dataobj/ext_agent_agent?w=", strrep("c", 30))
  tok <- connection_token(long, "AWSALB=pin")
  expect_gt(nchar(tok), 200)
  expect_no_match(tok, "[\r\n]")
})

test_that("the registry lists live boards and forgets dead ones", {
  dir <- withr::local_tempdir()
  withr::local_options(blockr.agent_registry = dir)

  write_entry <- function(id, user, seen) {
    writeLines(jsonlite::toJSON(list(
      id = id, session = paste0(id, "0000"), url = "http://x", cookie = "",
      user = user, board = "b", pid = 1L, opened_at = seen, last_seen = seen
    ), auto_unbox = TRUE), file.path(dir, paste0(id, ".json")))
  }

  now <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S")
  old <- format(Sys.time() - 600, "%Y-%m-%dT%H:%M:%S")

  write_entry("live1", "ada", now)
  write_entry("live2", "other", now)
  # A process that died without removing its entry: not offered, because
  # offering it would send a caller at a board that is not there.
  write_entry("dead1", "ada", old)

  all <- list_boards()
  expect_setequal(vapply(all, `[[`, "", "id"), c("live1", "live2"))

  mine <- list_boards(user = "ada")
  expect_equal(length(mine), 1L)
  expect_equal(mine[[1]]$id, "live1")

  # No user means a machine that belongs to one person, so everything shows.
  expect_equal(length(list_boards(user = "")), 2L)
})
