import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { JSDOM } from "jsdom";

function read(name) {
    return readFile(new URL(`../../dist/${name}`, import.meta.url), "utf8");
}

const manager = await read("sumire.user.js");
const programs = {
    "wpvg-assessor.user.js": await read("wpvg-assessor.user.js"),
    "sumire.user.js": manager,
    "sumire.min.js": await read("sumire.min.js"),
};
const native = await read("wpvg-assessor.min.js");
const sourceOwner = Symbol.for("sumire.wpvg-assessor.source-links");
const startupOwner = Symbol.for("sumire.wpvg-assessor.startup");
const launcher = "#sumire-wpvg-assessor-launcher";

function createPage(t, url, content) {
    const dom = new JSDOM(content, { url, runScripts: "outside-only" });
    const { window } = dom;
    const timers = [];
    window.setTimeout = (callback) => timers.push(callback);
    t.after(() => window.close());
    return { window, timers };
}

function fakeMediaWiki(window) {
    const { document } = window;
    const config = {
        wgAction: "view",
        wgDBname: "zhwiki",
        wgNamespaceNumber: 0,
        wgUserName: "Fixture editor",
        wgUserLanguage: "zh",
        wgUserVariant: "zh-tw",
    };
    const warnings = [];
    const wiki = {
        config: { get: (name) => config[name] },
        loader: { using: async () => {} },
        log: { warn: (...args) => warnings.push(args) },
        util: {
            addPortletLink(portlet, href, label, id) {
                const item = document.createElement("li");
                const anchor = document.createElement("a");
                item.id = id;
                anchor.href = href;
                anchor.textContent = label;
                item.append(anchor);
                document.getElementById(portlet).append(item);
                return item;
            },
        },
    };
    return { wiki, warnings };
}

for (const [name, source] of Object.entries(programs)) {
    test(`${name} decorates both PetScan hosts without waiting for MediaWiki or using GM grants`, (t) => {
        for (const host of ["petscan.toolforge.org", "petscan.wmcloud.org"]) {
            const { window, timers } = createPage(
                t,
                `https://${host}/?psid=12`,
                `<table><tr><td>
                    <a id="article" href="https://zh.wikipedia.org/zh-tw/Game?uselang=en#History">Game</a>
                    <a id="revision" href="https://zh.wikipedia.org/w/index.php?title=Game&oldid=12">Revision</a>
                    <a id="edit" href="https://zh.wikipedia.org/wiki/Game?action=edit">Edit</a>
                    <a id="foreign" href="https://en.wikipedia.org/wiki/Game">Foreign</a>
                </td></tr></table>`,
            );
            window.eval(source);
            const { document } = window;
            assert.equal(
                document.getElementById("article").href,
                "https://zh.wikipedia.org/zh-tw/Game?uselang=en&wpvg-assessor=1#History",
            );
            for (const id of ["revision", "edit", "foreign"]) {
                assert.equal(
                    document.getElementById(id).href.includes("wpvg-assessor"),
                    false,
                );
            }
            assert.equal(window[startupOwner], undefined);
            assert.equal(timers.length, 0);
            const owner = window[sourceOwner];
            assert.equal(typeof owner, "function");
            window.eval(source);
            assert.equal(window[sourceOwner], owner);
            assert.equal(timers.length, 0);
        }
    });
}

test("native Assessor decorates the new-page list before MediaWiki arrives", async (t) => {
    const { window, timers } = createPage(
        t,
        "https://zh.wikipedia.org/wiki/WikiProject:电子游戏/新进条目",
        '<meta name="generator" content="MediaWiki 1.45"><div id="mw-content-text"><a href="/wiki/Game">Game</a></div><ul id="p-tb"></ul>',
    );
    window.eval(native);
    assert.equal(
        window.document.querySelector("#mw-content-text a").href,
        "https://zh.wikipedia.org/wiki/Game?wpvg-assessor=1",
    );
    assert.equal(window[startupOwner], undefined);
    assert.equal(timers.length, 1);
    const { wiki, warnings } = fakeMediaWiki(window);
    window.mw = wiki;
    timers.shift()();
    await new Promise(setImmediate);
    assert.equal(window.document.querySelectorAll(launcher).length, 1);
    assert.ok(window[startupOwner]);
    assert.deepEqual(warnings, []);
    assert.equal(timers.length, 0);
});

test("aggregate userscript uses the wiki page's MediaWiki and shares startup with native installs", async (t) => {
    const { window } = createPage(
        t,
        "https://zh.wikipedia.org/wiki/Game",
        '<ul id="p-tb"></ul>',
    );
    const { wiki, warnings } = fakeMediaWiki(window);
    window.mw = wiki;
    const sandbox = { location: window.location, document: window.document };
    window.eval(`(function(window, unsafeWindow, mw) {\n${manager}\n})`)(
        sandbox,
        window,
        undefined,
    );
    await new Promise(setImmediate);
    const owner = window[startupOwner];
    assert.ok(owner);
    assert.equal(sandbox[startupOwner], undefined);
    assert.equal(
        window.document.querySelector(launcher).textContent,
        "條目評級",
    );

    window.eval(native);
    window.eval(await read("sumire.min.js"));
    await new Promise(setImmediate);
    assert.equal(window[startupOwner], owner);
    assert.equal(window.document.querySelectorAll(launcher).length, 1);
    assert.deepEqual(warnings, []);
});
