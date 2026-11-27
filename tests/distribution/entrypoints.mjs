import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";

import { verifyDistributions } from "@for-each-next/wp/release";

import product from "../../package.json" with { type: "json" };

const dist = new URL("../../dist/", import.meta.url);
const profile = "For Each ... Next";
const repository = "For-Each-Next/wp-sumire";
const { version } = product;

function read(name) {
    return readFile(new URL(name, dist), "utf8");
}

async function run(names, globals) {
    const context = createContext({ URL, URLSearchParams, ...globals });
    for (const filename of names) {
        new Script(await read(filename), { filename }).runInContext(context);
    }
    await new Promise((resolve) => setImmediate(resolve));
}

function wikiPage(url, config, canonical) {
    const location = new URL(url);
    const items = new Map();
    const mounts = [];
    const warnings = [];
    const document = {
        location,
        readyState: "complete",
        body: { classList: { contains: () => true } },
        getElementById: (id) => items.get(id) ?? null,
        querySelector: () => canonical && { href: canonical },
    };
    const mw = {
        config: { get: (key) => config[key] },
        loader: { using: async () => {} },
        Title: { newFromText: () => ({ getNamespaceId: () => 0 }) },
        util: {
            addPortletLink(_portlet, href, _label, id) {
                const link = {
                    href,
                    addEventListener() {},
                    querySelector: () => null,
                };
                mounts.push(id);
                items.set(id, link);
                return { querySelector: () => link };
            },
        },
        log: { warn: (...warning) => warnings.push(warning) },
    };
    return { browser: { location, document }, mw, items, mounts, warnings };
}

function reviewPage(url) {
    const location = new URL(url);
    const reads = [];
    const commands = [];
    const started = new Set();
    const document = {
        location,
        body: { classList: { contains: () => false } },
        documentElement: {
            hasAttribute: (attribute) => started.has(attribute),
            setAttribute: (attribute) => started.add(attribute),
        },
        querySelector: () => null,
        addEventListener() {},
        createElement() {
            return {
                ownerDocument: document,
                dataset: {},
                addEventListener() {},
                append() {},
                attachShadow: () => ({ append() {} }),
                setAttribute() {},
            };
        },
    };
    const window = {
        document,
        location,
        MutationObserver: class {
            disconnect() {}
        },
        addEventListener() {},
        setInterval() {},
    };
    return {
        window,
        reads,
        commands,
        grants: {
            GM_getValue: (key) => {
                reads.push(key);
            },
            GM_setValue: () => assert.fail("Startup wrote to manager storage"),
            GM_addStyle: () => assert.fail("A non-review route added labels"),
            GM_registerMenuCommand: (name) => {
                commands.push(name);
            },
            GM_xmlhttpRequest: () =>
                assert.fail("A non-review route fetched source data"),
        },
    };
}

test("the distribution contains the complete artifact set at the product version", async () => {
    const manifest = await verifyDistributions(fileURLToPath(dist), {
        version,
        repository,
    });
    assert.deepEqual(
        manifest.files.map(({ name }) => name),
        [
            "LICENSE.txt",
            "draft-copy.min.js",
            "draft-copy.user.js",
            "meta-contributions.min.js",
            "meta-contributions.user.js",
            "sumire.full.user.js",
            "sumire.min.js",
            "sumire.runtime.js",
            "sumire.user.js",
            "wpvg-source-labels.user.js",
        ],
    );
    const loader = await read("sumire.user.js");
    assert.match(loader, /==\/UserScript==\n$/u);
    assert.match(loader, /^\/\/ @sandbox\s+JavaScript$/mu);
    assert.match(loader, /^\/\/ @grant\s+unsafeWindow$/mu);
    const standalone = await read("wpvg-source-labels.user.js");
    assert.match(standalone, /^\/\/ @name\s+WPVG Source Labels$/mu);
    assert.match(standalone, /^\/\/ @namespace\s+personal-gadgets$/mu);
    assert.match(standalone, /^\/\/ @sandbox\s+DOM$/mu);
    const reviewGrants = [
        "GM_addStyle",
        "GM_getValue",
        "GM_setValue",
        "GM_registerMenuCommand",
        "GM_xmlhttpRequest",
    ];
    for (const source of [standalone, loader]) {
        assert.deepEqual(
            [...source.matchAll(/^\/\/ @grant\s+(GM_\w+)$/gmu)].map(
                (match) => match[1],
            ),
            reviewGrants,
        );
        assert.match(source, /^\/\/ @connect\s+en\.wikipedia\.org$/mu);
    }
});

test("the cached aggregate runtime uses the page Wiki object for Draft Copy", async () => {
    const { browser, mw, items, warnings } = wikiPage(
        "https://zh.m.wikipedia.org/wiki/Example",
        {
            wgAction: "view",
            wgDBname: "zhwiki",
            wgNamespaceNumber: 0,
            wgArticleId: 42,
            wgRevisionId: 124,
            wgPageName: "Example",
            wgPageContentModel: "wikitext",
            wgNamespaceIds: { draft: 118 },
        },
    );
    await run(["sumire.runtime.js", "sumire.user.js"], {
        window: browser,
        unsafeWindow: { mw },
    });
    assert.deepEqual([...items.keys()], ["ca-draft-copy"]);
    assert.deepEqual(warnings, []);
});

test("native and standalone Wiki scripts share one profile action on a local wiki", async () => {
    const { browser, mw, items, mounts, warnings } = wikiPage(
        "https://wiki.example.test/wiki/User:For_Each_..._Next",
        {
            wgAction: "view",
            wgNamespaceNumber: 2,
            wgTitle: profile,
            wgUserName: profile,
            wgArticleId: 0,
        },
        "https://meta.wikimedia.org/wiki/User:For_Each_..._Next",
    );
    await run(["sumire.min.js", "meta-contributions.min.js"], {
        window: { ...browser, mw },
    });
    assert.deepEqual(mounts, ["ca-meta-contributions"]);
    const action = items.get("ca-meta-contributions");
    const target = new URL(action.href);
    assert.equal(target.origin, "https://meta.wikimedia.org");
    assert.equal(
        target.searchParams.get("personal-gadgets-edit-contributions"),
        "1",
    );
    assert.equal(action.target, "_blank");
    assert.deepEqual(warnings, []);
});

test("manager scripts start a single WPVG observer on a supported host", async () => {
    const { window, grants, reads, commands } = reviewPage(
        "https://www.metacritic.com/game/example/",
    );
    await run(
        ["sumire.runtime.js", "sumire.user.js", "wpvg-source-labels.user.js"],
        { window, ...grants },
    );
    assert.deepEqual(reads, [
        "wpvg-source-cache-v2",
        "wpvg-source-settings-v1",
    ]);
    assert.equal(commands.length, 3);
});

test("the self-contained aggregate runs WPVG without loading project code", async () => {
    const { window, grants, reads, commands } = reviewPage(
        "https://opencritic.com/game/42/example/",
    );
    const full = await read("sumire.full.user.js");
    assert.doesNotMatch(full, /^\/\/ @require\s/mu);
    await run(["sumire.full.user.js"], { window, ...grants });
    assert.deepEqual(reads, [
        "wpvg-source-cache-v2",
        "wpvg-source-settings-v1",
    ]);
    assert.equal(commands.length, 3);
});

test("native Wiki scripts leave review hosts free of manager API calls", async () => {
    const { window, commands } = reviewPage("https://opencritic.com/");
    await run(["sumire.min.js"], { window });
    assert.deepEqual(commands, []);
});
