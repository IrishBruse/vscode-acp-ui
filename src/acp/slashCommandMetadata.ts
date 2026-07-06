/** Trailing parenthetical labels Cursor embeds in skill descriptions. */
export function parseTrailingParenLabels(text: string): {
    description: string;
    labels: string[];
} {
    let description = text.trimEnd();
    const labels: string[] = [];
    while (true) {
        const match = description.match(/\s+\(([^)]+)\)$/);
        if (match === null || match.index === undefined) {
            break;
        }
        labels.unshift(match[1].trim());
        description = description.slice(0, match.index).trimEnd();
    }
    return { description, labels };
}

/** Merges an explicit agent source with labels parsed from the description. */
export function normalizeSlashCommandSource(
    explicitSource: string | undefined,
    descriptionLabels: string[],
): string | undefined {
    const parts: string[] = [];
    const seen = new Set<string>();
    const add = (value: string): void => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return;
        }
        const key = trimmed.toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        parts.push(trimmed);
    };
    if (explicitSource !== undefined) {
        add(explicitSource);
    }
    for (const label of descriptionLabels) {
        add(label);
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
}

const GROUP_SCOPE_ORDER = [
    "workspace",
    "user skill",
    "user",
    "global",
] as const;

const GROUP_SORT_ORDER: Record<string, number> = {
    "built-in": 0,
    workspace: 1,
    "user skill": 2,
    user: 3,
    global: 4,
};

function sourceTokens(source: string): string[] {
    return source
        .split(/\s*·\s*/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);
}

/** Picks the scope token used to group slash commands in the composer menu. */
export function slashCommandGroupLabel(source: string | undefined): string {
    if (source === undefined) {
        return "Built-in";
    }
    const tokens = sourceTokens(source);
    for (const scope of GROUP_SCOPE_ORDER) {
        const hit = tokens.find(
            (token) =>
                token.toLowerCase() === scope ||
                token.toLowerCase().includes(scope),
        );
        if (hit !== undefined) {
            return hit;
        }
    }
    return tokens[0] ?? source;
}

export function compareSlashCommandGroups(
    leftLabel: string,
    rightLabel: string,
): number {
    const leftKey = leftLabel.toLowerCase();
    const rightKey = rightLabel.toLowerCase();
    const leftOrder = GROUP_SORT_ORDER[leftKey] ?? 50;
    const rightOrder = GROUP_SORT_ORDER[rightKey] ?? 50;
    if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
    }
    return leftLabel.localeCompare(rightLabel, undefined, {
        sensitivity: "base",
    });
}

export function normalizeSlashCommand(args: {
    name: string;
    description: string;
    source?: string;
    inputHint?: string;
}): {
    name: string;
    description: string;
    source?: string;
    inputHint?: string;
} {
    const parsed = parseTrailingParenLabels(args.description);
    const source = normalizeSlashCommandSource(args.source, parsed.labels);
    return {
        name: args.name,
        description: parsed.description,
        ...(args.inputHint !== undefined ? { inputHint: args.inputHint } : {}),
        ...(source !== undefined ? { source } : {}),
    };
}
