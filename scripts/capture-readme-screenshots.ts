/**
 * Capture README screenshots from the standalone demo (no VS Code required).
 *
 * Usage: npm run screenshots
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");

const captures: Array<{ fixture: string; filename: string }> = [
    { fixture: "showcase", filename: "Fullscreen.png" },
    { fixture: "markdown", filename: "Markdown.png" },
    { fixture: "tools", filename: "Tool-call.png" },
    { fixture: "plan", filename: "Plan.png" },
];

async function reservePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (address === null || typeof address === "string") {
                server.close();
                reject(new Error("Failed to reserve an ephemeral port."));
                return;
            }
            const port = address.port;
            server.close((err) => {
                if (err !== undefined) {
                    reject(err);
                    return;
                }
                resolve(port);
            });
        });
        server.on("error", reject);
    });
}

type RunningProcess = {
    name: string;
    child: ChildProcess;
};

async function waitForUrl(
    url: string,
    timeoutMs = 30_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            /* retry */
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

function startProcess(
    name: string,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
): RunningProcess {
    const child = spawn(command, args, {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
        process.stdout.write(`[${name}] ${chunk.toString()}`);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(`[${name}] ${chunk.toString()}`);
    });
    return { name, child };
}

async function stopProcesses(processes: RunningProcess[]): Promise<void> {
    await Promise.all(
        processes.map(
            (entry) =>
                new Promise<void>((resolve) => {
                    if (entry.child.killed || entry.child.exitCode !== null) {
                        resolve();
                        return;
                    }
                    entry.child.once("exit", () => resolve());
                    entry.child.kill("SIGTERM");
                    setTimeout(() => {
                        if (!entry.child.killed) {
                            entry.child.kill("SIGKILL");
                        }
                    }, 2_000);
                }),
        ),
    );
}

async function waitForTrace(page: Page): Promise<void> {
    await page.waitForSelector(".agent-root", { timeout: 30_000 });
    await page.waitForSelector(".composer-frame", { timeout: 30_000 });
    await page.waitForSelector(".user-prompt-bar", { timeout: 30_000 });
    await page.waitForTimeout(400);
}

async function captureFixture(
    browser: Browser,
    fixture: string,
    filename: string,
): Promise<void> {
    const vitePort = await reservePort();
    const wsPort = await reservePort();
    const baseUrl = `http://127.0.0.1:${vitePort}`;
    const demoEnv = {
        ...process.env,
        ACP_UI_DEMO: "1",
        ACP_UI_DEMO_FIXTURE: fixture,
        ACP_UI_VITE_PORT: String(vitePort),
        ACP_WS_PORT: String(wsPort),
    };

    const vite = startProcess(
        "vite",
        "npx",
        [
            "vite",
            "--config",
            "standalone/vite.config.ts",
            "--host",
            "127.0.0.1",
            "--port",
            String(vitePort),
        ],
        demoEnv,
    );
    const server = startProcess(
        "server",
        "npx",
        ["tsx", "standalone/server.ts"],
        demoEnv,
    );

    try {
        await waitForUrl(baseUrl);
        if (server.child.exitCode !== null) {
            throw new Error(
                `Standalone demo server exited before capturing ${fixture}.`,
            );
        }
        const page = await browser.newPage({
            viewport: { width: 1280, height: 900 },
            deviceScaleFactor: 2,
        });
        try {
            await page.goto(baseUrl, { waitUntil: "networkidle" });
            await waitForTrace(page);
            await page.screenshot({
                path: join(docsDir, filename),
                fullPage: false,
            });
            console.log(`Captured ${filename} from fixture ${fixture}`);
        } finally {
            await page.close();
        }
    } finally {
        await stopProcesses([vite, server]);
    }
}

async function main(): Promise<void> {
    await mkdir(docsDir, { recursive: true });
    const browser = await chromium.launch();
    try {
        for (const capture of captures) {
            await captureFixture(browser, capture.fixture, capture.filename);
        }
        console.log(`Wrote screenshots under ${docsDir}`);
    } finally {
        await browser.close();
    }
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
});
