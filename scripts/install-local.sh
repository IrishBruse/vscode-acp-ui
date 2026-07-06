#!/usr/bin/env bash
# Package this extension as a .vsix and install it into local VS Code.
#
# Prerequisites:
#   - Dependencies: npm ci (or npm install)
#   - VS Code CLI on PATH (default: `code`; override with CODE_CLI=cursor)
#
# Usage:
#   ./scripts/install-local.sh
#   SKIP_VERIFY=1 ./scripts/install-local.sh
#   CODE_CLI=cursor ./scripts/install-local.sh
#
# Same packaging entry point as publish: npx @vscode/vsce package
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [[ "${SKIP_VERIFY:-}" != "1" ]]; then
    npm run verify
fi

name="$(node -p "require('./package.json').name")"
version="$(node -p "require('./package.json').version")"
vsix="${name}-${version}.vsix"

npx @vscode/vsce package --out "$vsix" --skip-license

code_cli="${CODE_CLI:-code}"
if ! command -v "$code_cli" >/dev/null 2>&1; then
    echo "error: '$code_cli' not found on PATH." >&2
    echo "Install the VS Code shell command or set CODE_CLI to your editor CLI." >&2
    exit 1
fi

"$code_cli" --install-extension "$vsix" --force
echo "Installed $vsix via $code_cli"
