import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { buildDistributions } from "@for-each-next/wp/build";
import { renderUserscript } from "@for-each-next/wp/userscripts";
import { build } from "esbuild";

import {
    assessorHosts,
    assessorPetScanHosts,
    draftHosts,
    reviewHosts,
    wikiExclusions,
    wikiHosts,
} from "../src/shared/hosts.ts";
import { readAssessorAssets } from "./wpvg-assessor/assets.mjs";

const root = new URL("../", import.meta.url);
const { version, license, description } = JSON.parse(
    await readFile(new URL("package.json", root), "utf8"),
);
const repository = "For-Each-Next/wp-sumire";
const homepage = `https://github.com/${repository}`;
const publicAssets = `${homepage}/releases/latest/download`;
const assessorLicense = `${license} AND MIT AND CC-BY-4.0`;
const draftCopyLicense = `${license} AND BSD-3-Clause`;
const [assessorDefines, assessorNotices, diffNotice] = await Promise.all([
    readAssessorAssets(),
    readFile(new URL("THIRD-PARTY-NOTICES.md", root), "utf8"),
    readFile(
        new URL("LICENSE", import.meta.resolve("diff/package.json")),
        "utf8",
    ),
]);

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
        license: draftCopyLicense,
        draftCopy: true,
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
    },
    {
        id: "wpvg-assessor",
        name: "Article Assessor",
        namespace: "wpvg-assessor",
        description:
            "Review and save WikiProject Video games assessments on Chinese Wikipedia.",
        translations: [
            [
                "zh-CN",
                "条目评级",
                "在中文维基百科审阅和保存电子游戏专题的条目评级。",
            ],
            [
                "zh-TW",
                "條目評級",
                "在中文維基百科檢閱和儲存電子遊戲專題的條目評級。",
            ],
        ],
        hosts: assessorHosts,
        license: assessorLicense,
        assessor: true,
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
        [
            "zh-CN",
            "Sumire",
            "维基编辑工具、电子游戏条目评级及游戏评论来源标注。",
        ],
        [
            "zh-TW",
            "Sumire",
            "維基編輯工具、電子遊戲條目評級及遊戲評論來源標註。",
        ],
    ],
    hosts: [...wikiHosts, ...assessorPetScanHosts, ...reviewHosts],
    exclusions: wikiExclusions,
    grants: [...reviewGrants, "unsafeWindow"],
    connect: reviewConnect,
    sandbox: "JavaScript",
    license: `${assessorLicense} AND BSD-3-Clause`,
    assessor: true,
    draftCopy: true,
};

function metadata(script) {
    const {
        id,
        name,
        namespace = "sumire",
        description,
        translations,
        hosts,
        exclusions = [],
        grants = ["none"],
        connect = [],
        sandbox = "raw",
        license: scriptLicense = license,
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
        ["license", scriptLicense],
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

async function bundle(entry, { minify, assessor }) {
    const {
        outputFiles: [output],
    } = await build({
        absWorkingDir: fileURLToPath(root),
        entryPoints: [`src/entries/${entry}.ts`],
        bundle: true,
        charset: "utf8",
        define: assessor ? assessorDefines : undefined,
        format: "iife",
        legalComments: "none",
        platform: "browser",
        target: "es2020",
        minify,
        supported: minify ? { "template-literal": false } : undefined,
        write: false,
    });
    return output.text;
}

function banner({
    name,
    license: scriptLicense = license,
    assessor,
    draftCopy,
}) {
    const notices = [
        assessor ? assessorNotices : "",
        draftCopy ? diffNotice : "",
    ]
        .filter(Boolean)
        .map((notice) => `/*!\n${notice.trimEnd()}\n*/\n`)
        .join("");
    return `/*! ${name} v${version} | ${scriptLicense} */\n${notices}`;
}

function wikiProgram(tool, program) {
    return `// <nowiki>\n${banner(tool)}${program}// </nowiki>\n`;
}

async function scriptDistributions(tool) {
    const { id, assessor } = tool;
    const [script, compact] = await Promise.all([
        bundle(id, { minify: false, assessor }),
        bundle(id, { minify: true, assessor }),
    ]);
    const directives = metadata(tool);
    const wiki = wikiProgram(tool, compact);
    return new Map([
        [`${id}.user.js`, renderUserscript(directives, banner(tool) + script)],
        [
            `${id}.min.js`,
            tool.grants ? renderUserscript(directives, wiki) : wiki,
        ],
    ]);
}

await buildDistributions({
    root: fileURLToPath(root),
    version,
    targets: [sumire, ...tools],
    buildArtifacts: scriptDistributions,
});
