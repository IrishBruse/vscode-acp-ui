/**
 * Spawn configuration for an ACP agent subprocess. Shared by the extension
 * settings shape and standalone JSON config files.
 */
export type AcpAgentSpawnConfig = {
    name: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
    /** Overrides auto-selection when the agent advertises multiple auth methods. */
    authMethodId?: string;
};

/** Auth method shape used for resolving which `authenticate` methodId to call. */
export type AcpAuthMethodRef = {
    id: string;
    type?: string;
};

/** Cursor ACP `_meta` key that requests separate model-parameter config options. */
export const PARAMETERIZED_MODEL_PICKER_META_KEY = "parameterizedModelPicker";

/** True when the spawn config targets Cursor's ACP agent (`cursor-agent`, etc.). */
export function isCursorAcpAgent(config: AcpAgentSpawnConfig): boolean {
    const command = config.command.toLowerCase();
    const name = config.name.toLowerCase();
    return (
        command.includes("cursor") ||
        name.includes("cursor") ||
        (command === "agent" && config.args.some((arg) => arg.includes("acp")))
    );
}

function isAgentAuthMethod(method: AcpAuthMethodRef): boolean {
    return method.type === undefined || method.type === "agent";
}

/**
 * Picks the `methodId` for `authenticate` from advertised auth methods.
 * Returns undefined when no methods are advertised (skip authenticate).
 */
export function resolveAuthMethodId(
    methods: AcpAuthMethodRef[] | undefined,
    configuredId?: string,
): string | undefined {
    if (methods === undefined || methods.length === 0) {
        return undefined;
    }
    if (configuredId !== undefined && configuredId.length > 0) {
        const match = methods.find(
            (m) => m.id === configuredId && isAgentAuthMethod(m),
        );
        if (match === undefined) {
            const advertised = methods.map((m) => m.id).join(", ");
            throw new Error(
                `Configured authMethodId "${configuredId}" does not match an agent-type auth method. Advertised: ${advertised}`,
            );
        }
        return match.id;
    }
    const agentMethod = methods.find((m) => isAgentAuthMethod(m));
    if (agentMethod !== undefined) {
        return agentMethod.id;
    }
    throw new Error(
        "Agent requires env_var/terminal auth; ACP UI supports agent auth only.",
    );
}

/**
 * Parses `acp-agent.json`: a non-empty array of agent objects, or a single agent object
 * (accepted for backward compatibility).
 */
export function parseAcpAgentsJsonFileContent(
    content: unknown,
): AcpAgentSpawnConfig[] | undefined {
    if (Array.isArray(content)) {
        const result: AcpAgentSpawnConfig[] = [];
        for (const entry of content) {
            const one = parseAcpAgentSpawnConfig(entry);
            if (one !== undefined) {
                result.push(one);
            }
        }
        return result.length > 0 ? result : undefined;
    }
    const single = parseAcpAgentSpawnConfig(content);
    return single !== undefined ? [single] : undefined;
}

/** Parses one agent entry from settings or a JSON file. Returns undefined if invalid. */
export function parseAcpAgentSpawnConfig(
    entry: unknown,
): AcpAgentSpawnConfig | undefined {
    if (entry === null || typeof entry !== "object") {
        return undefined;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.command !== "string") {
        return undefined;
    }
    const args = Array.isArray(record.args)
        ? record.args.filter((a): a is string => typeof a === "string")
        : [];
    let env: Record<string, string> | undefined;
    if (
        record.env !== null &&
        typeof record.env === "object" &&
        !Array.isArray(record.env)
    ) {
        env = {};
        for (const [k, v] of Object.entries(
            record.env as Record<string, unknown>,
        )) {
            if (typeof v === "string") {
                env[k] = v;
            }
        }
    }
    const authMethodId =
        typeof record.authMethodId === "string" &&
        record.authMethodId.trim().length > 0
            ? record.authMethodId.trim()
            : undefined;
    return {
        name: record.name,
        command: record.command,
        args,
        ...(env !== undefined ? { env } : {}),
        ...(authMethodId !== undefined ? { authMethodId } : {}),
    };
}
