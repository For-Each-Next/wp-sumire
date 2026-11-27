import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { writeDistributions } from "@for-each-next/wp/release";
import {
    releaseAssetBase,
    renderUserscript,
    withIntegrity,
} from "@for-each-next/wp/userscripts";
import { build } from "esbuild";

import {
    draftHosts,
    reviewHosts,
    wikiExclusions,
    wikiHosts,
} from "../src/shared/hosts.ts";

const root = new URL("../", import.meta.url);
const { version, license, description } = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
);
const repository = "For-Each-Next/wp-sumire";
const homepage = `https://github.com/${repository}`;
const publicAssets = `${homepage}/releases/latest/download`;

const reviewGrants = [
    "GM_addStyle",
    "GM_getValue",
    "GM_setValue",
    "GM_registerMenuCommand",
    "GM_xmlhttpRequest",
];
const reviewConnect = ["en.wikipedia.org"];
const tools = [
    {
        id: "draft-copy",
        name: "Draft Copy",
        description:
            "Copy wikitext between articles and drafts on Chinese Wikipedia.",
        translations: [
            [
                "zh-CN",
                "草稿复制",
                "在中文维基百科的条目和草稿之间复制维基文本。",
            ],
            [
                "zh-TW",
                "草稿複製",
                "在中文維基百科的條目和草稿之間複製維基文字。",
            ],
        ],
        hosts: draftHosts,
        native: true,
    },
    {
        id: "meta-contributions",
        name: "Meta Contributions Editor",
        description:
            "Edit contributions, barnstars, quotations, and userboxes on your Meta-Wiki global user page.",
        translations: [
            [
                "zh-CN",
                "元维基贡献编辑器",
                "编辑元维基全域用户页上的贡献、星章、引语和用户框。",
            ],
            [
                "zh-TW",
                "元維基貢獻編輯器",
                "編輯元維基全域使用者頁面上的貢獻、星章、引語和使用者框。",
            ],
        ],
        hosts: wikiHosts,
        exclusions: wikiExclusions,
        native: true,
    },
    {
        id: "wpvg-source-labels",
        name: "WPVG Source Labels",
        namespace: "personal-gadgets",
        description:
            "Show Wikipedia WikiProject Video games source classifications on critic reviews.",
        translations: [
            [
                "zh-TW",
                "WPVG 遊戲評論來源標註",
                "在 Metacritic 和 OpenCritic 顯示維基百科電玩專題的評論來源分類。",
            ],
        ],
        hosts: reviewHosts,
        grants: reviewGrants,
        connect: reviewConnect,
        sandbox: "DOM",
    },
];

const sumire = {
    id: "sumire",
    name: "Sumire",
    description,
    translations: [
        ["zh-CN", "Sumire", "维基编辑工具及游戏评论的维基百科来源标注。"],
        ["zh-TW", "Sumire", "維基編輯工具及遊戲評論的維基百科來源標註。"],
    ],
    hosts: [...wikiHosts, ...reviewHosts],
    exclusions: wikiExclusions,
    grants: [...reviewGrants, "unsafeWindow"],
    connect: reviewConnect,
    sandbox: "JavaScript",
};

function metadata(script, id = script.id) {
    const {
        name,
        namespace = "sumire",
        description,
        translations,
        hosts,
        exclusions = [],
        grants = ["none"],
        connect = [],
        sandbox = "raw",
    } = script;
    const update = `${publicAssets}/${id}.user.js`;
    return [
        ["name", name],
        ...translations.map(([locale, name]) => [`name:${locale}`, name]),
        ["namespace", namespace],
        ["version", version],
        ["description", description],
        ...translations.map(([locale, , description]) => [
            `description:${locale}`,
            description,
        ]),
        ["license", license],
        ["homepageURL", homepage],
        ["updateURL", update],
        ["downloadURL", update],
        ...hosts.map((host) => ["match", `https://${host}/*`]),
        ...exclusions.map((host) => ["exclude", `https://${host}/*`]),
        ["run-at", "document-end"],
        ...grants.map((grant) => ["grant", grant]),
        ...connect.map((host) => ["connect", host]),
        ["sandbox", sandbox],
        ["noframes"],
    ];
}

async function bundle(entry, { minify = false, wiki = false } = {}) {
    const {
        outputFiles: [output],
    } = await build({
        absWorkingDir: fileURLToPath(root),
        entryPoints: [`src/entries/${entry}.ts`],
        bundle: true,
        charset: "utf8",
        format: "iife",
        legalComments: "none",
        platform: "browser",
        target: "es2020",
        minify,
        supported: wiki ? { "template-literal": false } : undefined,
        write: false,
    });
    return output.text;
}

function banner(name) {
    return `/*! ${name} v${version} | ${license} */\n`;
}

function wikiProgram(name, program) {
    return `// <nowiki>\n${banner(name)}${program}// </nowiki>\n`;
}

async function toolDistributions(tool) {
    const { id, name, native } = tool;
    const [script, wiki] = await Promise.all([
        bundle(id),
        native ? bundle(id, { minify: true, wiki: true }) : undefined,
    ]);
    const files = {
        [`${id}.user.js`]: renderUserscript(
            metadata(tool),
            banner(name) + script,
        ),
    };
    if (wiki) files[`${id}.min.js`] = wikiProgram(name, wiki);
    return files;
}

const [toolFiles, aggregate, wikiAggregate, licenseText] = await Promise.all([
    Promise.all(tools.map(toolDistributions)),
    bundle(sumire.id, { minify: true }),
    bundle("sumire-wiki", { minify: true, wiki: true }),
    readFile(new URL("LICENSE", root)),
]);
const runtimeName = "sumire.runtime.js";
const runtime = banner(sumire.name) + aggregate;
const runtimeUrl = withIntegrity(
    `${releaseAssetBase(repository, version)}${runtimeName}`,
    runtime,
);
const files = Object.assign({}, ...toolFiles, {
    "sumire.user.js": renderUserscript([
        ...metadata(sumire),
        ["require", runtimeUrl],
    ]),
    "sumire.full.user.js": renderUserscript(
        metadata(sumire, "sumire.full"),
        runtime,
    ),
    "sumire.min.js": wikiProgram(sumire.name, wikiAggregate),
    [runtimeName]: runtime,
    "LICENSE.txt": licenseText,
});

await writeDistributions(fileURLToPath(new URL("dist/", root)), {
    version,
    files,
});
