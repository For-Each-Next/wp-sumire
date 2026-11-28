import assert from "node:assert/strict";
import test from "node:test";

import { addDraftCopyAction } from "../src/draft-copy/browser.ts";
import { addContributionsAction } from "../src/meta-contributions/browser.ts";
import {
    META_PROFILE_URL,
    PROFILE_OWNER,
} from "../src/meta-contributions/meta-api.ts";

const articleTitle = "例子 条目";
const draftTitle = `Draft:${articleTitle}`;
const sourceTimestamp = "2026-11-25T12:34:56Z";
const queryTimestamp = "2026-11-25T12:40:00Z";
const targetTimestamp = "2026-11-25T12:38:00Z";
const watchExpiry = "2026-12-02T12:40:00Z";
const editToken = "mock-edit-token";

test("Meta-Wiki adds an Edit contributions link beside the native Edit action", async () => {
    const config = {
        wgAction: "view",
        wgNamespaceNumber: 2,
        wgTitle: PROFILE_OWNER,
        wgUserName: PROFILE_OWNER,
        wgUserLanguage: "en",
    };
    const nativeEdit = {
        matches: (selector) => selector === "a",
        closest: (selector) =>
            selector === ".mw-portlet" ? { id: "p-views" } : null,
    };
    const document = {
        location: new URL(META_PROFILE_URL),
        readyState: "complete",
        getElementById: (id) => (id === "ca-edit" ? nativeEdit : null),
    };
    const link = { querySelector: () => null, addEventListener() {} };
    const menuLinks = [];
    const mw = {
        config: { get: (key) => config[key] },
        loader: { async using() {} },
        util: {
            addPortletLink(...args) {
                menuLinks.push(args);
                return { querySelector: () => link };
            },
        },
    };

    assert.equal(await addContributionsAction(mw, document), link);
    assert.deepEqual(menuLinks, [
        [
            "p-views",
            META_PROFILE_URL,
            "Edit contributions",
            "ca-meta-contributions",
        ],
    ]);
});

function makeBrowser({
    sourceNamespace,
    sourceText,
    targetMissing = false,
    targetText = "目标页面原有的内容。",
    sourceHistory = [],
    targetHistory = [],
    historyBatchSize = Infinity,
    userLanguage = "en",
}) {
    const sourceTitle = sourceNamespace === 0 ? articleTitle : draftTitle;
    const targetTitle = sourceNamespace === 0 ? draftTitle : articleTitle;
    const source = {
        pageid: 17,
        ns: sourceNamespace,
        title: sourceTitle,
    };
    const target = {
        pageid: 23,
        ns: sourceNamespace === 0 ? 118 : 0,
        title: targetTitle,
    };
    const sourceRevisions = [
        { revid: 42, timestamp: sourceTimestamp, text: sourceText },
        ...sourceHistory,
    ];
    const targetRevision = {
        revid: 66,
        timestamp: targetTimestamp,
        text: targetText,
    };
    const histories = [
        [source, sourceRevisions],
        [target, [targetRevision, ...targetHistory]],
    ];
    const namespaceIds = {
        file: 6,
        文件: 6,
        category: 14,
        draft: 118,
        草稿: 118,
    };
    const config = {
        wgDBname: "zhwiki",
        wgAction: "view",
        wgArticleId: 17,
        wgRevisionId: 42,
        wgCurRevisionId: 42,
        wgNamespaceNumber: sourceNamespace,
        wgPageContentModel: "wikitext",
        wgPageName: sourceTitle.replaceAll(" ", "_"),
        wgUserLanguage: userLanguage,
        wgUserVariant: userLanguage,
    };

    function makeTitle(namespaceId, text) {
        const mainText = text.replaceAll("_", " ");
        const prefix = { 6: "File:", 118: "Draft:" }[namespaceId] ?? "";
        return {
            getNamespaceId: () => namespaceId,
            getMainText: () => mainText,
            getPrefixedText: () => prefix + mainText,
            getFragment: () => null,
        };
    }

    function withContent({ text, ...revision }) {
        return {
            ...revision,
            slots: { main: { content: text, contentmodel: "wikitext" } },
        };
    }

    const requests = [];
    const notifications = [];
    const submissions = [];
    const menuLinks = [];
    let click;

    const mw = {
        config: { get: (key) => config[key] },
        loader: {
            async using(modules) {
                assert.ok(modules.includes("mediawiki.Title"));
                config.wgNamespaceIds = namespaceIds;
            },
        },
        Title: {
            makeTitle,
            newFromText(text, defaultNamespace = 0) {
                const separator = text.indexOf(":");
                const namespace =
                    namespaceIds[text.slice(0, separator).toLowerCase()];
                return separator >= 0 && namespace !== undefined
                    ? makeTitle(namespace, text.slice(separator + 1))
                    : makeTitle(defaultNamespace, text);
            },
        },
        util: {
            addPortletLink(portlet, href, label, id) {
                menuLinks.push({ portlet, href, label, id });
                return {
                    querySelector(selector) {
                        assert.equal(selector, "a");
                        return {
                            querySelector: () => null,
                            setAttribute() {},
                            removeAttribute() {},
                            addEventListener(event, handler) {
                                assert.equal(event, "click");
                                click = handler;
                            },
                        };
                    },
                };
            },
            getUrl: (title, { action }) =>
                `/w/index.php?${new URLSearchParams({ title, action })}`,
        },
        user: { options: { get: (name) => Number(name === "minordefault") } },
        notify: (...args) => notifications.push(args),
        Api: class {
            async get(parameters) {
                requests.push({ method: "get", parameters });
                if (parameters.revids !== undefined) {
                    assert.equal(parameters.prop, "revisions");
                    for (const [page, revisions] of histories) {
                        const revision = revisions.find(
                            ({ revid }) => revid === parameters.revids,
                        );
                        if (revision) {
                            return {
                                query: {
                                    pages: [
                                        {
                                            ...page,
                                            revisions: [withContent(revision)],
                                        },
                                    ],
                                },
                            };
                        }
                    }
                    return { query: { pages: [] } };
                }
                if (parameters.pageids !== undefined) {
                    assert.equal(parameters.prop, "revisions");
                    assert.equal(parameters.rvprop, "ids|timestamp|comment");
                    const [page, revisions] = histories.find(
                        ([page]) => page.pageid === parameters.pageids,
                    );
                    assert.equal(parameters.rvstartid, revisions[0].revid);
                    const history = revisions.filter(
                        ({ timestamp }) =>
                            !parameters.rvend || timestamp >= parameters.rvend,
                    );
                    const offset = Number(parameters.rvcontinue ?? 0);
                    if (offset) assert.equal(parameters.continue, "||");
                    const end = offset + historyBatchSize;
                    return {
                        query: {
                            pages: [
                                {
                                    ...page,
                                    revisions: history
                                        .slice(offset, end)
                                        .map(
                                            ({
                                                revid,
                                                timestamp,
                                                comment,
                                            }) => ({
                                                revid,
                                                timestamp,
                                                comment,
                                            }),
                                        ),
                                },
                            ],
                        },
                        ...(end < history.length
                            ? {
                                  continue: {
                                      continue: "||",
                                      rvcontinue: String(end),
                                  },
                              }
                            : {}),
                    };
                }
                assert.equal(parameters.prop, "info|revisions");
                return {
                    curtimestamp: queryTimestamp,
                    query: {
                        tokens: { csrftoken: editToken },
                        pages: [
                            {
                                ...target,
                                contentmodel: "wikitext",
                                ...(targetMissing
                                    ? { pageid: undefined, missing: true }
                                    : {
                                          revisions: [
                                              withContent(targetRevision),
                                          ],
                                          watched: true,
                                          watchlistexpiry: watchExpiry,
                                      }),
                            },
                        ],
                    },
                };
            }

            async post(parameters) {
                requests.push({ method: "post", parameters });
                return {
                    query: {
                        redirects: [
                            {
                                from: "File:Alias.jpg",
                                to: "File:Original.jpg",
                            },
                        ],
                        pages: [
                            {
                                ns: 6,
                                title: "File:Original.jpg",
                                imagerepository: "local",
                            },
                            {
                                ns: 6,
                                title: "File:Shared.png",
                                imagerepository: "shared",
                            },
                        ],
                    },
                };
            }
        },
    };

    const attachedForms = new Set();
    const document = {
        getElementById: () => null,
        body: { append: (form) => attachedForms.add(form) },
        createElement(tagName) {
            if (tagName === "input") return {};
            assert.equal(tagName, "form");
            const inputs = [];
            return {
                append: (...elements) => inputs.push(...elements),
                submit() {
                    assert.ok(attachedForms.has(this));
                    submissions.push({
                        method: this.method,
                        action: this.action,
                        enctype: this.enctype,
                        fields: Object.fromEntries(
                            inputs.map(({ name, value }) => [name, value]),
                        ),
                    });
                },
            };
        },
    };

    return {
        mw,
        document,
        requests,
        notifications,
        submissions,
        menuLinks,
        async clickAction() {
            let preventedDefault = false;
            await click({
                preventDefault: () => {
                    preventedDefault = true;
                },
            });
            assert.equal(preventedDefault, true);
        },
    };
}

function assertEditorSubmission(submissions, expectedTitle, expectedSource) {
    assert.equal(submissions.length, 1);
    const [{ method, action, enctype, fields }] = submissions;
    assert.equal(method, "post");
    assert.equal(
        action,
        `/w/index.php?${new URLSearchParams({
            title: expectedTitle,
            action: "submit",
        })}`,
    );
    assert.equal(enctype, "multipart/form-data");
    assert.equal(Object.hasOwn(fields, "wpSave"), false);
    assert.equal(fields.wpUltimateParam, "1");
    assert.equal(fields.wpStarttime, "20261125124000");
    assert.equal(fields.wpEditToken, editToken);
    assert.equal(
        fields.wpSummary,
        `拷貝自[[${expectedSource}]]（[[Special:PermaLink/42|2026-11-25 12:34:56 UTC]]版）`,
    );
    return fields;
}

function copySummary(title, { revid, timestamp }) {
    const date = timestamp.replace("T", " ").replace("Z", " UTC");
    return `拷貝自[[${title}]]（[[Special:PermaLink/${revid}|${date}]]版）`;
}

function draftWikitext(body, task = "") {
    return (
        `{{Draft|${articleTitle}}}\n{{Todo|inner=\n${task}}}\n` +
        `{{Section sizes|bytes_heatmap=ignore_appendices}}\n\n${body}`
    );
}

test("the article action classifies files and opens a native preview for its matching draft", async () => {
    const sourceText = [
        "{{Infobox",
        "| image = Alias.jpg",
        "}}",
        "[[文件:Alias.jpg|thumb|图注]]",
        "[[File:Shared.png|thumb]]",
        "[[Category:例子|排序键]]",
        "",
    ].join("\n");
    const browser = makeBrowser({
        sourceNamespace: 0,
        sourceText,
        targetMissing: true,
    });

    await addDraftCopyAction(browser.mw, browser.document);
    assert.equal(browser.menuLinks.length, 1);
    assert.equal(browser.menuLinks[0].portlet, "p-cactions");
    assert.equal(browser.menuLinks[0].label, "Copy to draft");
    await browser.clickAction();
    assert.deepEqual(browser.notifications, []);

    const fields = assertEditorSubmission(
        browser.submissions,
        draftTitle,
        articleTitle,
    );
    assert.deepEqual([fields.wpPreview, fields.wpDiff], ["1", undefined]);
    assert.equal(fields.wpEdittime, "20261125124000");
    assert.equal(fields.editRevId, "0");
    assert.ok(
        fields.wpTextbox1.startsWith(
            `{{Draft|${articleTitle}}}\n{{Todo|inner=\n}}\n{{Section sizes|bytes_heatmap=ignore_appendices}}\n\n`,
        ),
    );
    assert.ok(
        fields.wpTextbox1.includes(
            "<!-- [[文件:Alias.jpg|thumb|图注]] // 根據[[WP:NFCC#9]]無效化檔案 -->",
        ),
    );
    assert.ok(
        fields.wpTextbox1.includes(
            "| image = <!-- Alias.jpg // 根據[[WP:NFCC#9]]無效化檔案 -->",
        ),
    );
    assert.ok(fields.wpTextbox1.includes("[[File:Shared.png|thumb]]"));

    const sourceQuery = browser.requests.find(
        ({ parameters }) => parameters.prop === "revisions",
    );
    const targetQuery = browser.requests.find(
        ({ parameters }) => parameters.prop === "info|revisions",
    );
    const fileQuery = browser.requests.find(
        ({ parameters }) => parameters.prop === "imageinfo",
    );
    assert.equal(sourceQuery.parameters.revids, 42);
    assert.equal(targetQuery.parameters.titles, draftTitle);
    assert.equal(fileQuery.method, "post");
    assert.deepEqual(fileQuery.parameters.titles, [
        "File:Alias.jpg",
        "File:Shared.png",
    ]);
    assert.ok(fileQuery.parameters.redirects);
    assert.ok(
        browser.requests.every(
            ({ parameters }) => parameters.action === "query",
        ),
    );
});

test("without a copy record, the draft action restores article wikitext and opens a native diff", async () => {
    const body = [
        "草稿中所作的编辑。",
        "<!-- [[File:Alias.jpg|thumb|图注]] // 根據[[WP:NFCC#9]]無效化檔案 -->",
        "<!-- 草稿留下的普通注释 -->",
        "{{Draft categories|1=\n[[Category:例子|排序键]]\n}}",
        "",
    ].join("\n");
    const sourceText =
        `{{Draft|${articleTitle}}}\n{{Todo|inner=\n* 检查 {{small|内容}}\n}}\n` +
        `{{Section sizes|bytes_heatmap=ignore_appendices}}\n\n${body}`;
    const browser = makeBrowser({
        sourceNamespace: 118,
        sourceText,
        targetMissing: false,
        userLanguage: "zh-tw",
    });

    await addDraftCopyAction(browser.mw, browser.document);
    assert.equal(browser.menuLinks.length, 1);
    assert.equal(browser.menuLinks[0].portlet, "p-cactions");
    assert.equal(browser.menuLinks[0].label, "發佈草稿");
    await browser.clickAction();
    assert.deepEqual(browser.notifications, []);

    const fields = assertEditorSubmission(
        browser.submissions,
        articleTitle,
        draftTitle,
    );
    assert.deepEqual([fields.wpPreview, fields.wpDiff], [undefined, "1"]);
    assert.equal(fields.wpEdittime, "20261125123800");
    assert.equal(fields.editRevId, "66");
    assert.equal(fields.wpWatchthis, "1");
    assert.equal(fields.wpWatchlistExpiry, watchExpiry);
    assert.equal(fields.wpMinoredit, "1");
    assert.equal(
        fields.wpTextbox1,
        [
            "草稿中所作的编辑。",
            "[[File:Alias.jpg|thumb|图注]]",
            "<!-- 草稿留下的普通注释 -->",
            "[[Category:例子|排序键]]",
            "",
        ].join("\n"),
    );
    assert.equal(browser.requests.length, 4);
    assert.ok(
        browser.requests.every(
            ({ method, parameters }) =>
                method === "get" && parameters.action === "query",
        ),
    );
});

const articleBase = {
    revid: 20,
    timestamp: "2026-11-25T12:29:00Z",
    text: "旧导言。\n原有正文。\n旧结尾。\n",
};
const firstCopy = {
    revid: 24,
    timestamp: "2026-11-25T12:30:00Z",
    comment: copySummary(articleTitle, articleBase),
};

test("publishing a draft merges its changes with article edits since the recorded copy", async () => {
    const browser = makeBrowser({
        sourceNamespace: 118,
        sourceText: draftWikitext("新导言。\n原有正文。\n旧结尾。\n"),
        targetText: "旧导言。\n原有正文。\n条目的新结尾。\n",
        sourceHistory: [firstCopy],
        targetHistory: [articleBase],
        historyBatchSize: 1,
    });
    await addDraftCopyAction(browser.mw, browser.document);
    await browser.clickAction();

    const fields = assertEditorSubmission(
        browser.submissions,
        articleTitle,
        draftTitle,
    );
    assert.equal(fields.wpDiff, "1");
    assert.equal(fields.editRevId, "66");
    assert.equal(fields.wpTextbox1, "新导言。\n原有正文。\n条目的新结尾。\n");
    assert.deepEqual(browser.notifications, []);
    assert.ok(
        browser.requests.some(
            ({ parameters }) => parameters.rvcontinue === "1",
        ),
    );
    assert.ok(
        browser.requests.some(
            ({ parameters }) => parameters.revids === articleBase.revid,
        ),
    );
    assert.ok(
        browser.requests.every(
            ({ parameters }) => parameters.action === "query",
        ),
    );
});

test("updating an existing draft uses the most recent copy and preserves draft-only work", async () => {
    const publishedDraft = {
        revid: 31,
        timestamp: "2026-11-25T12:31:00Z",
        text: draftWikitext(
            "旧导言。\n草稿第一次补充。\n旧结尾。\n",
            "* 校对\n",
        ),
    };
    const browser = makeBrowser({
        sourceNamespace: 0,
        sourceText:
            "旧导言。\n草稿第一次补充。\n条目的新结尾。\n[[File:Alias.jpg]]\n",
        sourceHistory: [
            {
                revid: 37,
                timestamp: "2026-11-25T12:33:00Z",
                comment: `${copySummary(draftTitle, publishedDraft)}，校对正文`,
            },
            articleBase,
        ],
        targetText: draftWikitext(
            "旧导言。\n草稿第二次补充。\n旧结尾。\n",
            "* 校对\n",
        ),
        targetHistory: [publishedDraft, firstCopy],
    });
    await addDraftCopyAction(browser.mw, browser.document);
    await browser.clickAction();

    const fields = assertEditorSubmission(
        browser.submissions,
        draftTitle,
        articleTitle,
    );
    assert.equal(fields.wpDiff, "1");
    assert.equal(fields.editRevId, "66");
    assert.equal(
        fields.wpTextbox1,
        draftWikitext(
            "旧导言。\n草稿第二次补充。\n条目的新结尾。\n" +
                "<!-- [[File:Alias.jpg]] // 根據[[WP:NFCC#9]]無效化檔案 -->\n",
            "* 校对\n",
        ),
    );
    assert.deepEqual(browser.notifications, []);
});

test("overlapping changes ask for a manual merge without opening a replacement edit", async () => {
    const browser = makeBrowser({
        sourceNamespace: 118,
        sourceText: draftWikitext("旧导言。\n草稿重写的正文。\n旧结尾。\n"),
        targetText: "旧导言。\n条目重写的正文。\n旧结尾。\n",
        sourceHistory: [firstCopy],
        targetHistory: [articleBase],
        userLanguage: "zh-cn",
    });
    await addDraftCopyAction(browser.mw, browser.document);
    await browser.clickAction();

    assert.deepEqual(browser.submissions, []);
    assert.deepEqual(browser.notifications, [
        [
            "无法自动合并条目和草稿的改动。请比较两个页面并手动合并。",
            { type: "error" },
        ],
    ]);
});

test("the copy base must be a revision of the linked counterpart", async () => {
    const unrelated = { ...articleBase, text: "另一个页面的内容。" };
    const browser = makeBrowser({
        sourceNamespace: 118,
        sourceText: draftWikitext("新导言。\n原有正文。\n旧结尾。\n"),
        sourceHistory: [firstCopy, unrelated],
    });
    await addDraftCopyAction(browser.mw, browser.document);
    await browser.clickAction();

    assert.deepEqual(browser.submissions, []);
    assert.match(
        browser.notifications[0][0],
        /could not be merged automatically/u,
    );
});
