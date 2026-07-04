#!/usr/bin/env bash
# Sync upstream ACP protocol docs and Cursor extension method docs into docs/.
#
# Layout (existing README screenshots at docs/*.png are left untouched):
#   docs/acp/                 Mintlify sources from agent-client-protocol
#   docs/acp/schema/          JSON schema from the same repo
#   docs/cursor-extensions/   Cursor CLI ACP page + extension-methods extract
#
# Usage:
#   ./scripts/sync-docs.sh
#   ACP_DOCS_REF=v1.2.3 ./scripts/sync-docs.sh
#   SKIP_CURSOR=1 ./scripts/sync-docs.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

ACP_REPO="${ACP_DOCS_REPO:-agentclientprotocol/agent-client-protocol}"
ACP_REF="${ACP_DOCS_REF:-main}"
CURSOR_ACP_URL="${CURSOR_ACP_DOCS_URL:-https://cursor.com/docs/cli/acp}"

acp_dest="docs/acp"
cursor_dest="docs/cursor-extensions"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

sync_stamp() {
    local dest="$1"
    local source="$2"
    cat >"${dest}/.sync-source" <<EOF
source=${source}
synced_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
}

echo "==> Fetching ACP docs from https://github.com/${ACP_REPO} @ ${ACP_REF}"
archive="${tmpdir}/acp.tar.gz"
curl -fsSL "https://github.com/${ACP_REPO}/archive/refs/heads/${ACP_REF}.tar.gz" -o "$archive"

tar xzf "$archive" -C "$tmpdir"
repo_dir="$(find "$tmpdir" -maxdepth 1 -mindepth 1 -type d | head -1)"
if [[ -z "$repo_dir" || ! -d "${repo_dir}/docs" ]]; then
    echo "error: expected docs/ in ${ACP_REPO} archive" >&2
    exit 1
fi

rm -rf "$acp_dest"
mkdir -p "$acp_dest"
cp -a "${repo_dir}/docs/." "$acp_dest/"
if [[ -d "${repo_dir}/schema" ]]; then
    mkdir -p "${acp_dest}/schema"
    cp -a "${repo_dir}/schema/." "${acp_dest}/schema/"
fi
sync_stamp "$acp_dest" "https://github.com/${ACP_REPO}/tree/${ACP_REF}"
echo "    wrote ${acp_dest}/"

if [[ "${SKIP_CURSOR:-}" == "1" ]]; then
    echo "==> Skipping Cursor docs (SKIP_CURSOR=1)"
    exit 0
fi

echo "==> Fetching Cursor ACP docs from ${CURSOR_ACP_URL}"
mkdir -p "$cursor_dest"
curl -fsSL -H "Accept: text/markdown" "$CURSOR_ACP_URL" -o "${cursor_dest}/acp.md"

# Extension method reference used by AcpSessionBridge (cursor/* ext methods).
awk '
    /^## Cursor extension methods$/ { capture = 1 }
    capture { print }
    capture && /^## Minimal Node\.js client$/ { exit }
' "${cursor_dest}/acp.md" | sed '$d' > "${cursor_dest}/extensions.md"

sync_stamp "$cursor_dest" "$CURSOR_ACP_URL"
echo "    wrote ${cursor_dest}/acp.md"
echo "    wrote ${cursor_dest}/extensions.md"
echo "==> Done"
