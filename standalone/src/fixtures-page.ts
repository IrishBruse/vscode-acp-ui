type StandaloneFixtureEntry = {
    id: string;
    label: string;
    description: string;
};

type StandaloneFixtureCatalog = {
    chats: StandaloneFixtureEntry[];
    seeds: StandaloneFixtureEntry[];
};

function chatFixtureUrl(
    id: string,
    seed = "cursor-model",
    replay = true,
): string {
    const params = new URLSearchParams({
        fixture: id,
        seed,
        replay: replay ? "1" : "0",
    });
    return `/?${params.toString()}`;
}

function seedFixtureUrl(id: string): string {
    const params = new URLSearchParams({
        seed: id,
        replay: "0",
    });
    return `/?${params.toString()}`;
}

function renderSection(
    title: string,
    entries: StandaloneFixtureEntry[],
    hrefFor: (entry: StandaloneFixtureEntry) => string,
): HTMLElement {
    const section = document.createElement("section");
    section.className = "fixtures-section";

    const heading = document.createElement("h2");
    heading.textContent = title;
    section.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "fixtures-list";

    for (const entry of entries) {
        const item = document.createElement("li");
        item.className = "fixtures-item";

        const link = document.createElement("a");
        link.className = "fixtures-link";
        link.href = hrefFor(entry);

        const linkTitle = document.createElement("span");
        linkTitle.className = "fixtures-link-title";
        linkTitle.textContent = entry.label;

        const linkDesc = document.createElement("span");
        linkDesc.className = "fixtures-link-desc";
        linkDesc.textContent = entry.description;

        link.appendChild(linkTitle);
        link.appendChild(linkDesc);
        item.appendChild(link);
        list.appendChild(item);
    }

    section.appendChild(list);
    return section;
}

async function main(): Promise<void> {
    const status = document.getElementById("fixtures-status");
    const root = document.getElementById("fixtures-root");
    if (status === null || root === null) {
        return;
    }

    let catalog: StandaloneFixtureCatalog;
    try {
        const response = await fetch("/api/fixtures");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        catalog = (await response.json()) as StandaloneFixtureCatalog;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        status.textContent = "";
        status.className = "fixtures-error";
        status.textContent = `Could not load fixtures (${message}). Is the standalone server running?`;
        return;
    }

    status.hidden = true;
    root.hidden = false;

    if (catalog.chats.length > 0) {
        root.appendChild(
            renderSection("Chat replays", catalog.chats, (entry) =>
                chatFixtureUrl(entry.id),
            ),
        );
    }

    if (catalog.seeds.length > 0) {
        root.appendChild(
            renderSection("Model picker seeds", catalog.seeds, (entry) =>
                seedFixtureUrl(entry.id),
            ),
        );
    }

    if (catalog.chats.length === 0 && catalog.seeds.length === 0) {
        status.hidden = false;
        status.textContent = "No fixtures found under standalone/fixtures/.";
    }
}

main().catch((err: unknown) => {
    const status = document.getElementById("fixtures-status");
    if (status === null) {
        return;
    }
    const message = err instanceof Error ? err.message : String(err);
    status.className = "fixtures-error";
    status.textContent = message;
});
