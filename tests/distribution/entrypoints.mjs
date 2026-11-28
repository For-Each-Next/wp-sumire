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
    const context = createContext({
        TextEncoder,
        URL,
        URLSearchParams,
        ...globals,
    });
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
            "sumire.min.js",
            "sumire.user.js",
            "wpvg-assessor.min.js",
            "wpvg-assessor.user.js",
            "wpvg-source-labels.min.js",
            "wpvg-source-labels.user.js",
        ],
    );
    const aggregate = await Promise.all(
        ["sumire.user.js", "sumire.min.js"].map(read),
    );
    assert.match(aggregate[0], /^[ \t]+function startWpvgSourceLabels\(/mu);
    assert.ok(aggregate[1].length < aggregate[0].length);
    for (const source of aggregate) {
        assert.match(source, /^\/\/ @sandbox\s+JavaScript$/mu);
        assert.match(source, /^\/\/ @grant\s+unsafeWindow$/mu);
        assert.match(
            source,
            /^\/\/ @updateURL\s+https:\/\/github\.com\/For-Each-Next\/wp-sumire\/releases\/latest\/download\/sumire\.user\.js$/mu,
        );
    }
    const draftCopy = await read("draft-copy.user.js");
    assert.match(draftCopy, /^\/\/ @license\s+CC0-1\.0 AND BSD-3-Clause$/mu);
    for (const name of [
        "draft-copy.user.js",
        "draft-copy.min.js",
        "sumire.user.js",
        "sumire.min.js",
    ]) {
        assert.match(
            await read(name),
            /Copyright \(c\) 2009-2015, Kevin Decker/u,
            name,
        );
    }
    const assessor = await read("wpvg-assessor.user.js");
    assert.match(assessor, /^\/\/ @name\s+Article Assessor$/mu);
    assert.match(assessor, /^\/\/ @namespace\s+wpvg-assessor$/mu);
    assert.match(assessor, /^\/\/ @grant\s+none$/mu);
    assert.match(assessor, /^\/\/ @sandbox\s+raw$/mu);
    assert.match(
        assessor,
        /^\/\/ @license\s+CC0-1\.0 AND MIT AND CC-BY-4\.0$/mu,
    );
    assert.deepEqual(
        [...assessor.matchAll(/^\/\/ @match\s+(\S+)$/gmu)].map(
            ([, url]) => url,
        ),
        [
            "https://zh.wikipedia.org/*",
            "https://petscan.toolforge.org/*",
            "https://petscan.wmcloud.org/*",
        ],
    );
    const licenseNotice = "Copyright (c) 2011-2022 Wikimedia Design & OOUI";
    for (const name of [
        "wpvg-assessor.user.js",
        "wpvg-assessor.min.js",
        "sumire.user.js",
        "sumire.min.js",
    ]) {
        assert.ok((await read(name)).includes(licenseNotice), name);
    }
    const standalone = await Promise.all(
        ["wpvg-source-labels.user.js", "wpvg-source-labels.min.js"].map(read),
    );
    for (const source of standalone) {
        assert.match(source, /^\/\/ @name\s+WPVG Source Labels$/mu);
        assert.match(source, /^\/\/ @namespace\s+personal-gadgets$/mu);
        assert.match(source, /^\/\/ @sandbox\s+DOM$/mu);
    }
    const reviewGrants = [
        "GM_addStyle",
        "GM_getValue",
        "GM_setValue",
        "GM_registerMenuCommand",
        "GM_xmlhttpRequest",
    ];
    for (const source of [...aggregate, ...standalone]) {
        assert.doesNotMatch(source, /^\/\/ @require\s/mu);
        assert.deepEqual(
            [...source.matchAll(/^\/\/ @grant\s+(GM_\w+)$/gmu)].map(
                (match) => match[1],
            ),
            reviewGrants,
        );
        assert.match(source, /^\/\/ @connect\s+en\.wikipedia\.org$/mu);
    }
});

for (const name of ["sumire.user.js", "sumire.min.js"]) {
    test(`${name} uses the page Wiki object for Draft Copy`, async () => {
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
        const context = name.endsWith(".user.js")
            ? { window: browser, unsafeWindow: { mw } }
            : { window: { ...browser, mw } };
        await run([name], context);
        assert.deepEqual([...items.keys()], ["ca-draft-copy"]);
        assert.deepEqual(warnings, []);
    });
}

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
    await run(["sumire.user.js", "wpvg-source-labels.min.js"], {
        window,
        ...grants,
    });
    assert.deepEqual(reads, [
        "wpvg-source-cache-v2",
        "wpvg-source-settings-v1",
    ]);
    assert.equal(commands.length, 3);
});

for (const name of [
    "sumire.user.js",
    "sumire.min.js",
    "wpvg-source-labels.user.js",
    "wpvg-source-labels.min.js",
]) {
    test(`${name} starts WPVG with manager permissions`, async () => {
        const { window, grants, reads, commands } = reviewPage(
            "https://opencritic.com/game/42/example/",
        );
        await run([name], { window, ...grants });
        assert.deepEqual(reads, [
            "wpvg-source-cache-v2",
            "wpvg-source-settings-v1",
        ]);
        assert.equal(commands.length, 3);
    });
}

test("minified scripts skip review startup without manager permissions", async () => {
    const { window, commands } = reviewPage("https://opencritic.com/");
    await run(["sumire.min.js", "wpvg-source-labels.min.js"], { window });
    assert.deepEqual(commands, []);
});
