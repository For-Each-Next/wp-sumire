import assert from "node:assert/strict";
import test from "node:test";

import { PROFILE_OWNER } from "../src/meta-contributions/meta-api.ts";
import { parsePrefillLink } from "../src/meta-contributions/prefill-link.ts";
import { prefillContribution } from "../src/meta-contributions/prefill.ts";

const ownerId = 37;
const pageId = 48;
const revision = 179;
const blank = { label: "", type: "", draft: "", talk: "", status: "" };

function information(title, ns, extra = {}, users) {
    return { query: { pages: [{ title, ns, ...extra }], users } };
}

function authorship(tokens, revid = revision) {
    return {
        success: true,
        page_id: pageId,
        revisions: [{ [revid]: { tokens } }],
    };
}

async function run(section, source, ...responses) {
    const link = parsePrefillLink(source, "zh");
    assert.ok(link, `usable link: ${source}`);
    const calls = [];
    async function fetcher(input, options) {
        const body = responses[calls.length];
        calls.push({ url: new URL(input), options });
        if (body instanceof Error) throw body;
        return { ok: body !== undefined, json: async () => body };
    }
    const fields = await prefillContribution(
        section,
        link,
        PROFILE_OWNER,
        fetcher,
    );
    for (const { url, options } of calls) {
        assert.equal(url.protocol, "https:");
        assert.equal(url.searchParams.get("origin"), "*");
        assert.equal(options.credentials, "omit");
        assert.ok(options.signal instanceof AbortSignal);
        assert.equal(url.searchParams.has("assertuser"), false);
        assert.equal(url.searchParams.has("token"), false);
    }
    return { calls, fields };
}

test("an In progress link to a central peer review keeps the review anchor and extracts its subject", async () => {
    const title = "Wikipedia:同行评审/提案区";
    const anchor = `${PROFILE_OWNER.replaceAll(" ", "_")}的意见_@_电子游戏中的死亡`;
    const source = `https://zh.wikipedia.org/wiki/${title}#${encodeURIComponent(anchor)}`;
    const { fields, calls } = await run(
        "working",
        source,
        information(title, 4),
    );
    assert.deepEqual(fields, {
        ...blank,
        title: "电子游戏中的死亡",
        site: "zh",
        type: "rev",
        talk: `${title}#${anchor}`,
    });
    assert.equal(calls.length, 1);
    const { url } = calls[0];
    assert.equal(url.origin, "https://zh.wikipedia.org");
    assert.equal(url.pathname, "/w/api.php");
    assert.deepEqual(Object.fromEntries(url.searchParams), {
        format: "json",
        formatversion: "2",
        origin: "*",
        action: "query",
        prop: "info",
        inprop: "associatedpage",
        titles: title,
        redirects: "1",
        converttitles: "1",
    });

    const completed = await run("reviews", source, information(title, 4));
    assert.deepEqual(completed.fields, {
        ...blank,
        title: `${title}#${anchor}`,
        site: "zh",
        label: "电子游戏中的死亡",
        status: "pr",
    });
    assert.equal(completed.calls.length, 1);
});

test("a localized Talk link uses the associated article and preserves the explicit section and label", async () => {
    const article = "BanG Dream! 少女樂團派對";
    const { fields, calls } = await run(
        "working",
        "[[zh:討論:BanG_Dream!_少女樂團派對#甲級條目評審_2|BanG Dream!]]",
        information(`讨论:${article}`, 1, { associatedpage: article }),
    );
    assert.deepEqual(fields, {
        ...blank,
        title: article,
        site: "zh",
        label: "BanG Dream!",
        type: "rev",
        talk: `Talk:${article}#甲級條目評審_2`,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.searchParams.get("titles"), `討論:${article}`);
    assert.equal(calls[0].url.searchParams.has("list"), false);
});

test("direct Draft and User subpages prefill a writing target without looking up authorship", async () => {
    const draftTitle = "火焰之纹章 万缕千丝";
    const draft = await run(
        "working",
        `[[草稿:${draftTitle}#概要_部分]]`,
        information(`草稿:${draftTitle}`, 118),
    );
    assert.deepEqual(draft.fields, {
        ...blank,
        title: draftTitle,
        site: "zh",
        type: "draft",
        draft: `Draft:${draftTitle}#概要_部分`,
    });
    const subject = "風来のシレン6";
    const subpage = `${PROFILE_OWNER}/${subject}`;
    const user = await run(
        "working",
        `[[ja:利用者:${subpage}#作業用|シレン6]]`,
        information(`利用者:${subpage}`, 2),
    );
    assert.deepEqual(user.fields, {
        ...blank,
        title: subject,
        site: "ja",
        label: "シレン6",
        type: "draft",
        draft: `User:${subpage}#作業用`,
    });
    assert.equal(draft.calls.length, 1);
    assert.equal(user.calls.length, 1);
});

test("a leading WikiWho contribution selects writing and looks up an existing draft", async () => {
    const title = "信賴鈴音 ～蕭邦之夢～";
    const { fields, calls } = await run(
        "working",
        title,
        information(title, 0, { pageid: pageId, lastrevid: revision }, [
            { userid: ownerId },
        ]),
        authorship([
            { editor: 29, str: "甲" },
            { editor: String(ownerId), str: "七個字以上的長句" },
            { editor: 29, str: "乙" },
        ]),
        {
            query: {
                pages: [
                    { title: `使用者:${PROFILE_OWNER}/${title}`, ns: 2 },
                    { title: `草稿:${title}`, ns: 118 },
                ],
            },
        },
    );
    assert.deepEqual(fields, {
        ...blank,
        title,
        site: "zh",
        type: "draft",
        draft: `Draft:${title}`,
    });
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url.searchParams.get("list"), "users");
    assert.equal(calls[0].url.searchParams.get("ususers"), PROFILE_OWNER);
    assert.equal(calls[1].url.origin, "https://wikiwho-api.wmcloud.org");
    assert.equal(
        decodeURIComponent(calls[1].url.pathname),
        `/zh/api/v1.0.0-beta/rev_content/${title}/`,
    );
    assert.equal(calls[1].url.searchParams.get("editor"), "true");
    assert.equal(calls[1].url.searchParams.has("ususers"), false);
    assert.equal(
        calls[2].url.searchParams.get("titles"),
        `Draft:${title}|User:${PROFILE_OWNER}/${title}`,
    );
});

test("a different leading author selects copy editing and prefills the article discussion page", async () => {
    const title = "Fate/stay night";
    const { fields, calls } = await run(
        "working",
        "https://en.wikipedia.org/wiki/Fate/stay_night",
        information(
            title,
            0,
            {
                pageid: pageId,
                lastrevid: revision,
                associatedpage: `Talk:${title}`,
            },
            [{ userid: ownerId }],
        ),
        authorship([
            { editor: ownerId, str: "short" },
            {
                editor: 51,
                str: "The other author contributed this longer passage.",
            },
        ]),
    );
    assert.deepEqual(fields, {
        ...blank,
        title,
        site: "en",
        type: "ce",
        talk: `Talk:${title}`,
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.origin, "https://wikiwho-api.wmcloud.org");
    assert.equal(
        calls[1].url.pathname,
        `/en/api/v1.0.0-beta/rev_content/page_id/${pageId}/`,
    );
});

test("stale, malformed, or unavailable authorship leaves the working activity unspecified", async () => {
    const title = "Hollow Knight";
    const info = information(
        title,
        0,
        { pageid: pageId, lastrevid: revision },
        [{ userid: ownerId }],
    );
    const tokens = [{ editor: ownerId, str: "Leading author" }];
    for (const response of [
        authorship(tokens, revision - 1),
        { ...authorship(tokens), page_id: pageId + 1 },
        authorship([{ str: "Missing editor" }]),
        new Error("WikiWho unavailable"),
    ]) {
        const { fields, calls } = await run(
            "working",
            "en:Hollow_Knight",
            info,
            response,
        );
        assert.deepEqual(fields, { ...blank, title, site: "en" });
        assert.equal(calls.length, 2);
    }
});

test("article and review prefills use section-specific assessments and reviews link the discussion page", async () => {
    const title = "Hollow Knight";
    const info = information(title, 0, { associatedpage: `Talk:${title}` });
    for (const [grade, articleStatus, reviewStatus] of [
        ["B+", "bplus", "bplus-rev"],
        ["C", "c", ""],
    ]) {
        const rating = information(title, 0, {
            pageassessments: {
                "Project-independent assessment": { class: grade },
            },
        });
        const article = await run("articles", `en:${title}`, info, rating);
        const review = await run("reviews", `en:${title}`, info, rating);

        assert.deepEqual(article.fields, {
            ...blank,
            title,
            site: "en",
            status: articleStatus,
        });
        assert.deepEqual(review.fields, {
            ...blank,
            title: `Talk:${title}`,
            site: "en",
            status: reviewStatus,
        });
        for (const { calls } of [article, review]) {
            assert.equal(calls.length, 2);
            assert.equal(calls[0].url.searchParams.has("list"), false);
            assert.equal(
                calls[1].url.searchParams.get("prop"),
                "pageassessments",
            );
            assert.equal(calls[1].url.searchParams.get("titles"), title);
        }
    }
});

test("explicit copy editing and quality-review anchors take precedence over the current article assessment", async () => {
    for (const [article, anchor, status] of [
        ["地球冒险3", "润色意见", "ce"],
        ["BanG Dream! 少女樂團派對", "甲級條目評審", "a-rev"],
    ]) {
        const { fields, calls } = await run(
            "reviews",
            `[[討論:${article}#${anchor}]]`,
            information(`讨论:${article}`, 1, { associatedpage: article }),
        );
        assert.deepEqual(fields, {
            ...blank,
            title: `Talk:${article}#${anchor}`,
            site: "zh",
            status,
        });
        assert.equal(calls.length, 1);
    }
});
