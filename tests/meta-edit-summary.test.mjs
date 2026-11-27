import assert from "node:assert/strict";
import test from "node:test";

import {
    MAX_EDIT_SUMMARY_LENGTH,
    suggestContributionSummary,
} from "../src/meta-contributions/edit-summary.ts";

function entry(id, title, fields = {}) {
    return {
        id,
        title,
        site: "",
        label: "",
        status: "",
        date: "",
        type: "",
        draft: "",
        talk: "",
        notes: [],
        ...fields,
    };
}

function section(id, ...entries) {
    return { id, defaultSite: "en", entries };
}

test("points to the deepest heading and groups additions with plain names", () => {
    const first = entry("new-1", "''Example_subject''");
    const second = entry("new-2", "Alternate subject", {
        label: "[[Target|Readable label]]",
    });
    const before = [
        section("working"),
        section("articles"),
        section("reviews"),
    ];
    for (const [id, heading] of [
        ["working", "In progress"],
        ["articles", "Articles"],
        ["reviews", "Reviews"],
    ]) {
        const after = [section(id, first, second)];
        assert.equal(
            suggestContributionSummary(before, after),
            `/* ${heading} */ Added “Example subject” and “Readable label”.`,
        );
    }
});

test("describes a cross-section move in one clause and uses the common heading", () => {
    const draft = entry("work-1", "Draft:Another subject", { type: "draft" });
    const before = [section("working", draft), section("articles")];
    const after = [
        section("working"),
        section("articles", {
            ...draft,
            title: "Another subject",
            type: "",
            date: "2026-05",
        }),
    ];
    assert.equal(
        suggestContributionSummary(before, after),
        "/* Contributions */ Moved “Another subject” from In progress to Articles.",
    );
});

test("reports edited fields and removals across distinct sections", () => {
    const article = entry("article-1", "Another subject", { status: "stub" });
    const review = entry("review-1", "Talk:Review target#Review", {
        label: "Review target",
    });
    const before = [section("articles", article), section("reviews", review)];
    const after = [
        section("articles", {
            ...article,
            label: "Friendly title",
            status: "b",
            notes: ["Note"],
        }),
        section("reviews"),
    ];
    assert.equal(
        suggestContributionSummary(before, after),
        "/* Contributions */ Updated the display title, assessment, and notes for “Friendly title” in Articles and removed “Review target” from Reviews.",
    );
});

test("names the old and new page titles, assessments, and dates when only that field changes", () => {
    const article = entry("article-1", "Old_page", {
        label: "Friendly title",
        status: "b",
        date: "2026-11",
    });
    const before = [section("articles", article)];
    assert.equal(
        suggestContributionSummary(before, [
            section("articles", { ...article, title: "New_page" }),
        ]),
        "/* Articles */ Changed the page title from “Old page” to “New page”.",
    );
    assert.equal(
        suggestContributionSummary(before, [
            section("articles", { ...article, status: "ga" }),
        ]),
        "/* Articles */ Changed the assessment for “Friendly title” from B-class article to Good article.",
    );
    assert.equal(
        suggestContributionSummary(before, [
            section("articles", { ...article, date: "2026-12" }),
        ]),
        "/* Articles */ Changed the date for “Friendly title” from November 2026 to December 2026.",
    );
});

test("detects reordering without counting entries shifted by additions or removals", () => {
    const first = entry("first", "First");
    const second = entry("second", "Second");
    const before = [section("working", first, second)];
    assert.equal(
        suggestContributionSummary(before, [
            section("working", second, first),
        ]),
        "/* In progress */ Reordered entries.",
    );
    assert.equal(
        suggestContributionSummary(before, [section("working", second)]),
        "/* In progress */ Removed “First”.",
    );
    assert.equal(suggestContributionSummary(before, []), "");
    assert.equal(
        suggestContributionSummary(before, [
            section("working", { ...first, title: " First " }, second),
        ]),
        "",
    );
});

test("cleans source markup and prevents titles or labels from adding section delimiters", () => {
    const value = entry("new", "Unused", {
        label: "<b>Label</b> /* Wrong heading */\r\n[[Page|and link]]; <!-- private -->",
    });
    assert.equal(
        suggestContributionSummary(
            [section("reviews")],
            [section("reviews", value)],
        ),
        "/* Reviews */ Added “Label Wrong heading and link”.",
    );
});

test("folds long multi-entry edits into a Unicode-safe summary with a remaining count", () => {
    const entries = Array.from({ length: 32 }, (_, index) =>
        entry(String(index), `Topic ${index} ${"🛹".repeat(200)}`),
    );
    const summary = suggestContributionSummary(
        [section("articles")],
        [section("articles", ...entries)],
    );
    const remaining = Number(/added (\d+) more entries/u.exec(summary)?.[1]);
    assert.ok([...summary].length <= MAX_EDIT_SUMMARY_LENGTH);
    assert.ok(!/[\uD800-\uDFFF]/u.test(summary));
    assert.equal(
        (summary.match(/“/gu)?.length ?? 0) + remaining,
        entries.length,
    );
});
