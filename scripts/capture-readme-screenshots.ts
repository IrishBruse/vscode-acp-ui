/**
 * Capture README screenshots from the standalone demo (no VS Code required).
 *
 * Usage: npm run screenshots
 */

import { type ChildProcess, spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = join(root, "docs");

type CaptureSpec = {
    filename: string;
    fixture?: string;
    seed?: string;
    replay?: boolean;
    composerOnly?: boolean;
};

const captures: CaptureSpec[] = [
    { fixture: "showcase", seed: "cursor-model", filename: "Fullscreen.png" },
    { fixture: "markdown", seed: "cursor-model", filename: "Markdown.png" },
    { fixture: "tools", seed: "cursor-model", filename: "Tool-call.png" },
    { fixture: "plan", seed: "cursor-model", filename: "Plan.png" },
    {
        seed: "cursor-model",
        filename: "Model-picker-cursor.png",
        replay: false,
        composerOnly: true,
    },
    {
        seed: "opus-model",
        filename: "Model-picker-opus.png",
        replay: false,
        composerOnly: true,
    },
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

async function waitForUrl(url: string, timeoutMs = 30_000): Promise<void> {
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

async function waitForComposer(
    page: Page,
    requireTrace: boolean,
): Promise<void> {
    await page.waitForSelector(".composer-frame", { timeout: 30_000 });
    await page.waitForSelector(".composer-footer-model", { timeout: 30_000 });
    if (requireTrace) {
        await page.waitForSelector(".user-prompt-bar", { timeout: 30_000 });
    }
    await page.waitForTimeout(400);
}

async function captureSpec(
    browser: Browser,
    capture: CaptureSpec,
): Promise<void> {
    const vitePort = await reservePort();
    const wsPort = await reservePort();
    const baseUrl = `http://127.0.0.1:${vitePort}`;
    const demoEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ACP_UI_DEMO: "1",
        ACP_UI_DEMO_SEED: capture.seed ?? "cursor-model",
        ACP_UI_DEMO_REPLAY: capture.replay === false ? "0" : "1",
        ACP_UI_VITE_PORT: String(vitePort),
        ACP_WS_PORT: String(wsPort),
    };
    if (capture.fixture !== undefined) {
        demoEnv.ACP_UI_DEMO_FIXTURE = capture.fixture;
    }

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
                `Standalone demo server exited before capturing ${capture.filename}.`,
            );
        }
        const page = await browser.newPage({
            viewport: { width: 1280, height: 900 },
            deviceScaleFactor: 2,
        });
        try {
            await page.goto(baseUrl, { waitUntil: "networkidle" });
            await waitForComposer(page, capture.composerOnly !== true);
            if (capture.composerOnly === true) {
                await page.locator(".composer-footer").screenshot({
                    path: join(docsDir, capture.filename),
                });
            } else {
                await page.screenshot({
                    path: join(docsDir, capture.filename),
                    fullPage: false,
                });
            }
            console.log(`Captured ${capture.filename}`);
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
            await captureSpec(browser, capture);
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
