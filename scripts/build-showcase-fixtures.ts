/**
 * Writes committed NDJSON chat fixtures for standalone demo and README screenshots.
 *
 * Usage: npm run build:fixtures
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chatsDir = join(root, "standalone/fixtures/chats");
const sessionId = "acp-ui-showcase-session";

type SessionUpdate = Record<string, unknown>;

function line(update: SessionUpdate): string {
    return JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId, update },
    });
}

function userText(text: string): string {
    return line({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text },
    });
}

function thoughtText(text: string, durationMs?: number): string {
    return line({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text },
        ...(durationMs !== undefined ? { durationMs } : {}),
    });
}

function agentText(text: string): string {
    return line({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
    });
}

function toolCall(
    toolCallId: string,
    title: string,
    kind: string,
    subtitle?: string,
): string {
    return line({
        sessionUpdate: "tool_call",
        toolCallId,
        title,
        kind,
        status: "pending",
        rawInput: {},
        ...(subtitle !== undefined ? { subtitle } : {}),
    });
}

function toolComplete(
    toolCallId: string,
    payload: Record<string, unknown>,
): string {
    return line({
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "completed",
        ...payload,
    });
}

function planEntries(
    entries: Array<{ content: string; status: string; priority?: string }>,
): string {
    return line({
        sessionUpdate: "plan",
        entries,
    });
}

function writeFixture(name: string, lines: string[]): void {
    writeFileSync(join(chatsDir, `${name}.ndjson`), `${lines.join("\n")}\n`);
}

const markdownAgentMessage = `# ACP UI markdown

## Colored headings

Headings pick up theme-aware colors from the active VS Code theme.

### Inline code and lists

Use \`ib-acp-ui.agents\` in settings, then:

- Open **ACP UI** from the activity bar
- Start a chat from the **Chats** sidebar
- Inspect RPC traffic in the **ACP UI RPC** output channel

#### fenced code blocks

\`\`\`typescript
export function mountChatView(
  root: HTMLElement,
  init: InitPayload,
): ChatView {
  return createRoot(root).render(<AcpUiApp init={init} />);
}
\`\`\`

\`\`\`json
{
  "name": "Cursor",
  "command": "agent",
  "args": ["acp"]
}
\`\`\`
`;

const readFileContent = `import { window } from "vscode";

export function activate(): void {
  window.showInformationMessage("ACP UI ready.");
}
`;

const diffOld = `export function activate(): void {
  window.showInformationMessage("ACP UI ready.");
}
`;

const diffNew = `export function activate(): void {
  window.showInformationMessage("ACP UI is active.");
}
`;

mkdirSync(chatsDir, { recursive: true });

writeFixture("markdown", [
    userText("Show me how assistant markdown renders in ACP UI."),
    thoughtText("Prepare a compact markdown sample with headings and code.", 2400),
    agentText(markdownAgentMessage),
]);

writeFixture("tools", [
    userText("Read extension.ts and update the activation message."),
    thoughtText("Read the entry file, then apply a one-line edit.", 1800),
    toolCall("tool-read-ext", "Read File", "read"),
    toolComplete("tool-read-ext", {
        rawOutput: { content: readFileContent },
    }),
    toolCall("tool-write-ext", "Write File", "edit"),
    toolComplete("tool-write-ext", {
        content: [
            {
                type: "diff",
                path: "src/extension.ts",
                oldText: diffOld,
                newText: diffNew,
            },
        ],
    }),
    agentText(
        "Updated `src/extension.ts` so activation uses the new message string.",
    ),
]);

writeFixture("plan", [
    userText("Plan a README refresh for the extension."),
    planEntries([
        {
            content: "Capture new standalone screenshots",
            status: "completed",
            priority: "high",
        },
        {
            content: "Document mock chat fixtures",
            status: "in_progress",
            priority: "medium",
        },
        {
            content: "Publish patch release",
            status: "pending",
            priority: "low",
        },
    ]),
    agentText(
        "## Plan ready\n\nI broke the README work into screenshot capture, fixture docs, and release prep.",
    ),
]);

writeFixture("showcase", [
    userText("Walk me through the main ACP UI rendering features."),
    thoughtText("Show markdown, a read tool, a write diff, and the plan block.", 3200),
    agentText(
        "## Overview\n\nACP UI renders streaming assistant markdown, tool calls, thoughts, and agent plans in one trace.\n",
    ),
    toolCall("tool-read-readme", "Read File", "read"),
    toolComplete("tool-read-readme", {
        rawOutput: {
            content:
                "# ACP UI\n\nVS Code extension for Agent Client Protocol chat.\n",
        },
    }),
    agentText(markdownAgentMessage),
    toolCall("tool-write-readme", "Write File", "edit"),
    toolComplete("tool-write-readme", {
        content: [
            {
                type: "diff",
                path: "README.md",
                oldText: "## Features\n\n- ACP-backed chat webview\n",
                newText:
                    "## Features\n\n- ACP-backed chat webview with syntax-highlighted markdown\n- Inline tool calls and diffs\n",
            },
        ],
    }),
    planEntries([
        {
            content: "Refresh README screenshots",
            status: "in_progress",
        },
        {
            content: "Verify standalone demo fixtures",
            status: "pending",
        },
    ]),
    agentText(
        "That covers colored headings, fenced code highlighting, read/write tool calls, and plan updates.",
    ),
]);

console.log(`Wrote fixtures under ${chatsDir}`);
