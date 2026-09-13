#!/usr/bin/env bash
# Run the MCP facade locally. PORT defaults to 8765; in the devcontainer use a forwarded port (3838-3847).
#   BLOCKR_SESSION_URL=<url from the Agent panel> dev/facade.sh
cd "$(dirname "$0")/../inst/facade" && exec python3 -m uvicorn server:app --host 0.0.0.0 --port "${PORT:-8765}"
