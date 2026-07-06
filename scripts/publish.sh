#!/usr/bin/env bash
# Publish this extension to the Visual Studio Marketplace using vsce.
#
# Prerequisites:
#   - Dependencies: npm ci (or npm install)
#   - Bump "version" in package.json when publishing a new release (Marketplace rejects duplicates)
#   - Personal access token with Marketplace (Manage) scope, then:
#       export VSCE_PAT="your_token_here"
#
# Usage:
#   ./scripts/publish.sh
#   SKIP_VERIFY=1 ./scripts/publish.sh          # skip npm run verify (still runs vscode:prepublish)
#   ./scripts/publish.sh -- --allow-star-activation   # extra vsce flags after --
#
# Same entry point as CI: npx @vscode/vsce publish
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ -z "${VSCE_TOKEN:-}" ]]; then
    echo "error: VSCE_TOKEN is not set." >&2
    echo "Create a token with Marketplace (Manage) scope and export it, e.g.:" >&2
    echo "  export VSCE_PAT=\"<token>\"" >&2
    echo "See: https://code.visualstudio.com/api/working-with-extensions/publishing-extension" >&2
    exit 1
fi

if [[ "${SKIP_VERIFY:-}" != "1" ]]; then
    npm run verify
fi

exec npx @vscode/vsce publish --skip-license "$@"
