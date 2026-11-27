type WikiRuntime = {
    config: { get(name: "wgAction"): unknown };
    loader: { using(modules: string[]): PromiseLike<unknown> };
    log?: { warn(...details: unknown[]): void };
};

export function documentReady(document: Document): Promise<void> {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", () => resolve(), {
            once: true,
        });
    });
}

export function startOnWiki<Wiki extends WikiRuntime>(
    browser: Window,
    page: Window & { mw?: Wiki },
    tool: string,
    initialize: (wiki: Wiki, document: Document) => Promise<unknown>,
): void {
    const { document } = browser;
    if (
        !page.mw?.loader &&
        !document.body?.classList.contains("mediawiki") &&
        !document.querySelector('meta[name="generator"][content^="MediaWiki"]')
    ) {
        return;
    }

    let attempts = 0;
    function start() {
        const wiki = page.mw;
        if (
            typeof wiki?.loader?.using === "function" &&
            typeof wiki?.config?.get === "function" &&
            typeof wiki.config.get("wgAction") === "string"
        ) {
            void initialize(wiki, document).catch((error: unknown) => {
                wiki.log?.warn(`[${tool}]`, error);
            });
        } else if (++attempts < 200) {
            browser.setTimeout(start, 50);
        }
    }
    start();
}
