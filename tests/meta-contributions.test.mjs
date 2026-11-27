import assert from "node:assert/strict";
import test from "node:test";

import { moveCompletedEntry } from "../src/meta-contributions/completion.ts";
import {
    ContributionFormatError,
    parseContributions,
} from "../src/meta-contributions/contributions.ts";
import { suggestContributionSummary } from "../src/meta-contributions/edit-summary.ts";

const beginning = "Profile introduction\n<!--\n== Contributions ==\n-->\n";
const ending = "\n== Other projects ==\nOther content.\n";
const working = [
    "=== In progress ===",
    "{{/|working|site=zh|data=",
    "",
    "; title : Sandbox draft",
    "; type : draft",
    "; draft : Draft:Sandbox draft",
    "",
    "}}",
].join("\n");
const articles = [
    "=== Articles === <!-- heading comment -->",
    "{{/ | 1 = contributions | site = EN | unknown = preserve | data =",
    "",
    "; SITE : zh",
    "; title : Example page <!-- retain this 🐦 -->",
    "; status : b",
    "; status : secondary-status",
    "  ; future-field : untouched",
    "; note : {{/|trans|en|A synthetic page|partly=yes}}",
    ": with [[Example|a link]]",
    "; note : A separate note",
    "",
    "<!-- Keep this separator. -->",
    "",
    "; title : Another example",
    "; date : 2024-10",
    "",
    "}}",
].join("\n");
const reviews = [
    "=== Reviews ===",
    "{{/|contributions|data=",
    "",
    "; title : Talk:Review subject#Assessment",
    "; label : Review label",
    "; status : ga-rev",
    "",
    "}}",
].join("\n");

function page(...subsections) {
    return (
        beginning +
        "== Contributions ==\n\n" +
        subsections.join("\n\n") +
        "\n" +
        ending
    );
}

test("calculates the three sections and retains the original bytes on a no-op", () => {
    const source = page(working, articles, reviews).replaceAll("\n", "\r\n");
    const parsed = parseContributions(source);
    assert.deepEqual(
        parsed.sections.map(({ id, defaultSite, entries }) => [
            id,
            defaultSite,
            entries.length,
        ]),
        [
            ["working", "zh", 1],
            ["articles", "en", 2],
            ["reviews", "en", 1],
        ],
    );
    const entry = parsed.sections[1].entries[0];
    assert.equal(entry.site, "zh");
    assert.equal(entry.title, "Example page");
    assert.equal(entry.status, "b");
    assert.deepEqual(entry.notes, [
        "{{/|trans|en|A synthetic page|partly=yes}}\nwith [[Example|a link]]",
        "A separate note",
    ]);
    assert.equal(parsed.sections[2].entries[0].label, "Review label");
    assert.equal(parsed.withSections(parsed.sections), source);
    assert.equal(parsed.withSections([]), source);
});

test("changes selected fields without rewriting formatting, comments, duplicates, or omitted sections", () => {
    const source = page(working, articles, reviews);
    const parsed = parseContributions(source);
    const selected = structuredClone(parsed.sections[1]);
    selected.entries[0].title = "Renamed example";
    selected.entries[0].status = "";
    selected.entries[0].notes[1] =
        "''Edited'' note <!-- new comment -->\nA continuation";
    const output = parsed.withSections([selected]);
    assert.equal(
        output,
        source
            .replace("; title : Example page", "; title : Renamed example")
            .replace("; status : b\n", "; status : \n")
            .replace(
                "; note : A separate note",
                "; note : ''Edited'' note <!-- new comment -->\n: A continuation",
            ),
    );
    const entry = parseContributions(output).sections[1].entries[0];
    assert.equal(entry.status, "");
    assert.equal(entry.notes[1], "''Edited'' note\nA continuation");
});

test("removes and adds whole records while keeping other records and separator comments", () => {
    const source = page(articles);
    const parsed = parseContributions(source);
    const selected = structuredClone(parsed.sections[0]);
    selected.entries = [
        selected.entries[1],
        {
            id: "new",
            title: "Draft:New example",
            site: "fr",
            label: "New label",
            status: "start",
            date: "2026-03",
            type: "",
            draft: "",
            talk: "",
            notes: ["One note\n; title : Part of the note"],
        },
    ];
    const output = parsed.withSections([selected]);
    assert.ok(
        output.includes(
            "; title : Another example\n; date : 2024-10\n\n<!-- Keep this separator. -->",
        ),
    );
    assert.ok(
        output.includes(
            "; site : fr\n; title : Draft:New example\n; label : New label",
        ),
    );
    assert.ok(
        output.includes("; note : One note\n: ; title : Part of the note"),
    );
    assert.ok(output.startsWith(beginning));
    assert.ok(output.endsWith(ending));
    const parsedAgain = parseContributions(output).sections[0];
    assert.deepEqual(
        parsedAgain.entries.map(({ title }) => title),
        ["Another example", "Draft:New example"],
    );
    assert.deepEqual(parsedAgain.entries[1].notes, [
        "One note\n; title : Part of the note",
    ]);
});

test("rejects ambiguous targets and unsupported record syntax", () => {
    assert.throws(
        () => parseContributions(page(articles, articles)),
        ContributionFormatError,
    );
    assert.throws(
        () =>
            parseContributions(
                page(working.replace("site=zh|data=", "site=zh|data=|data=")),
            ),
        ContributionFormatError,
    );
    assert.throws(
        () =>
            parseContributions(
                page(
                    working.replace(
                        "; title : Sandbox draft",
                        "Unsupported raw line",
                    ),
                ),
            ),
        ContributionFormatError,
    );
    assert.throws(
        () =>
            parseContributions(
                page(
                    articles.replace(
                        "retain this 🐦 -->",
                        "retain this 🐦\n-->",
                    ),
                ),
            ),
        ContributionFormatError,
    );
});

test("rejects structural delimiters in edited fields and misplaced record IDs", () => {
    const parsed = parseContributions(page(working, articles));
    const selected = structuredClone(parsed.sections[1]);
    for (const note of [
        "Raw | pipe",
        "}}\n== Inserted heading ==",
        "[https://example.test raw|pipe]",
        '<span title="raw|pipe">text</span>',
    ]) {
        selected.entries[0].notes = [note];
        assert.throws(
            () => parsed.withSections([selected]),
            ContributionFormatError,
        );
    }
    selected.entries[0].notes = ["Safe {{!}} pipe and [[Example|wikilink]]"];
    assert.ok(
        parsed
            .withSections([selected])
            .includes("; note : Safe {{!}} pipe and [[Example|wikilink]]"),
    );
    selected.entries[0].id = parsed.sections[0].entries[0].id;
    assert.throws(
        () => parsed.withSections([selected]),
        ContributionFormatError,
    );
});

test("completes a draft as an article and moves its notes and source fields in the same edit", () => {
    const source = page(
        working.replace(
            "; title : Sandbox draft",
            "; title : 草稿:Sandbox draft <!-- on the title -->\n; note : Draft notes\n; future-field : preserve\n; status : b",
        ),
        articles,
        reviews,
    );
    const parsed = parseContributions(source);
    const draft = structuredClone(parsed.sections);
    const workingEntry = draft[0].entries[0];
    const completed = moveCompletedEntry(
        draft,
        workingEntry.id,
        "articles",
        new Date(2026, 10, 25),
    );

    assert.equal(completed.id, workingEntry.id);
    assert.equal(completed.title, "Sandbox draft");
    assert.equal(completed.date, "2026-11");
    assert.equal(completed.site, "zh");
    assert.equal(completed.draft, "");
    assert.equal(completed.status, "b");
    assert.throws(
        () => parsed.withSections([draft[1]]),
        ContributionFormatError,
    );
    assert.throws(
        () => parsed.withSections([parsed.sections[0], draft[1]]),
        ContributionFormatError,
    );

    const output = parsed.withSections(draft);
    const [workingAfter, articlesAfter, reviewsAfter] =
        parseContributions(output).sections;
    assert.deepEqual(workingAfter.entries, []);
    assert.deepEqual(
        articlesAfter.entries.map(({ title }) => title),
        ["Sandbox draft", "Example page", "Another example"],
    );
    assert.deepEqual(articlesAfter.entries[0].notes, ["Draft notes"]);
    assert.ok(
        output.includes(
            "; title : Sandbox draft <!-- on the title -->\n; note : Draft notes\n; future-field : preserve",
        ),
    );
    assert.ok(!output.includes("; draft : Draft:Sandbox draft"));
    assert.deepEqual(reviewsAfter.entries, parsed.sections[2].entries);
    assert.ok(output.startsWith(beginning) && output.endsWith(ending));
});

test("completes copy editing as a review using its discussion link and existing completion date", () => {
    const discussionTitle = "Talk:Sandbox draft#Copy edit";
    const source = page(
        working
            .replace("; type : draft", "; type : ce\n; date : 2026-09")
            .replace(
                "; draft : Draft:Sandbox draft",
                `; talk : ${discussionTitle}`,
            ),
        articles,
        reviews,
    );
    const parsed = parseContributions(source);
    const draft = structuredClone(parsed.sections);
    const completed = moveCompletedEntry(
        draft,
        draft[0].entries[0].id,
        "reviews",
        new Date(2026, 10, 25),
    );

    assert.equal(completed.title, discussionTitle);
    assert.equal(completed.label, "Sandbox draft");
    assert.equal(completed.status, "ce");
    assert.equal(completed.date, "2026-09");
    assert.equal(completed.talk, "");
    const [workingAfter, articlesAfter, reviewsAfter] = parseContributions(
        parsed.withSections(draft),
    ).sections;
    assert.deepEqual(workingAfter.entries, []);
    assert.deepEqual(articlesAfter.entries, parsed.sections[1].entries);
    assert.equal(reviewsAfter.entries[0].title, discussionTitle);
    assert.equal(reviewsAfter.entries[0].label, "Sandbox draft");
    assert.equal(reviewsAfter.entries[0].status, "ce");
    assert.equal(
        reviewsAfter.entries[1].title,
        "Talk:Review subject#Assessment",
    );
});

test("completing a contribution uses assessment codes from its destination section", () => {
    const cases = [
        ["draft", "ce", "articles", ""],
        ["rev", "b", "reviews", "b-rev"],
        ["rev", "c", "reviews", ""],
        ["rev", "pr", "reviews", "pr"],
        ["ce", "b", "reviews", "ce"],
    ];
    for (const [type, status, destination, expected] of cases) {
        const source = page(
            working.replace(
                "; type : draft",
                `; type : ${type}\n; status : ${status}`,
            ),
            articles,
            reviews,
        );
        const parsed = parseContributions(source);
        const edited = structuredClone(parsed.sections);
        const completed = moveCompletedEntry(
            edited,
            edited[0].entries[0].id,
            destination,
        );
        assert.equal(
            completed.status,
            expected,
            `${type} with ${status} moved to ${destination}`,
        );

        const saved = parseContributions(parsed.withSections(edited));
        assert.equal(
            saved.sections.find(({ id }) => id === destination).entries[0]
                .status,
            expected,
        );
    }
});

test("reorders equal note text with its source formatting and comments", () => {
    const first = [
        "  ; NOTE : Same text <!-- First source annotation. -->",
        "<!-- Comment inside the first note. -->",
        " : Same continuation <!-- First continuation annotation. -->",
    ].join("\n");
    const second = [
        ";note : Same text <!-- Second source annotation. -->",
        ": Same continuation <!-- Second continuation annotation. -->",
    ].join("\n");
    const gap =
        "\n<!-- Keep this comment here. -->\n; future-field : keep this position\n";
    const source = page(
        working.replace(
            "; draft : Draft:Sandbox draft",
            "; draft : Draft:Sandbox draft\n" + first + gap + second,
        ),
    );
    const parsed = parseContributions(source.replaceAll("\n", "\r\n"));
    const edited = structuredClone(parsed.sections);
    const entry = edited[0].entries[0];
    assert.deepEqual(entry.notes, [
        "Same text\nSame continuation",
        "Same text\nSame continuation",
    ]);
    entry.noteOrigins = [1, 0];

    const expected = source
        .replace(first + gap + second, second + gap + first)
        .replaceAll("\n", "\r\n");
    assert.equal(parsed.withSections(edited), expected);
    assert.equal(
        suggestContributionSummary(parsed.sections, edited),
        "/* In progress */ Updated the notes for “Sandbox draft”.",
    );
});

test("reorders edited and new notes during completion and preserves comments from a deleted note", () => {
    const source = page(
        working.replace(
            "; draft : Draft:Sandbox draft",
            [
                "; draft : Draft:Sandbox draft",
                "; note : First <!-- First source. -->",
                "  ; future-field : preserve this position",
                "<!-- Keep this gap. -->",
                "; note : Second <!-- Second source. -->",
                "<!-- Context for second continuation. -->",
                ": Existing continuation <!-- Second continuation. -->",
                "; other-field : preserve this too",
                "; note : Deleted <!-- Legacy source comment. -->",
            ].join("\n"),
        ),
        articles,
    );
    const parsed = parseContributions(source);
    const edited = structuredClone(parsed.sections);
    const entry = edited[0].entries[0];
    entry.notes = [
        "Second edited\nExisting continuation",
        "New note\nNew continuation",
        "First",
    ];
    entry.noteOrigins = [1, null, 0];
    moveCompletedEntry(edited, entry.id, "articles");

    const output = parsed.withSections(edited, true);
    const expected = [
        "; note : Second edited <!-- Second source. -->",
        "<!-- Context for second continuation. -->",
        ": Existing continuation <!-- Second continuation. -->",
        "  ; future-field : preserve this position",
        "<!-- Keep this gap. -->",
        "; note : New note",
        ": New continuation",
        "; note : First <!-- First source. -->",
        "; other-field : preserve this too",
        "<!-- Legacy source comment. -->",
    ].join("\n");
    assert.ok(output.includes(expected));
    assert.deepEqual(
        parseContributions(output).sections[1].entries[0].notes,
        entry.notes,
    );
});

test("rejects missing, duplicate, and out-of-range note origins", () => {
    const parsed = parseContributions(page(articles));
    const edited = structuredClone(parsed.sections);
    const entry = edited[0].entries[0];
    for (const invalid of [[0], [0, 0], [0, 2]]) {
        entry.noteOrigins = invalid;
        assert.throws(
            () => parsed.withSections(edited),
            ContributionFormatError,
        );
    }
});

test("backfills every subsection with reverse numbering and preserves CRLF and record data", () => {
    const source = page(working, articles, reviews).replaceAll("\n", "\r\n");
    const parsed = parseContributions(source);
    assert.deepEqual(parsed.numberingNeeded, [
        "working",
        "articles",
        "reviews",
    ]);
    assert.equal(parsed.withSections([]), source);

    const output = parsed.withSections([], true);
    const expected = page(
        working.replace("; title :", "<!-- In progress 01 -->\n; title :"),
        articles
            .replace("; SITE :", "<!-- Article 02 -->\n; SITE :")
            .replace(
                "; title : Another example",
                "<!-- Article 01 -->\n; title : Another example",
            ),
        reviews.replace("; title :", "<!-- Review 01 -->\n; title :"),
    ).replaceAll("\n", "\r\n");
    assert.equal(output, expected);

    const again = parseContributions(output);
    assert.deepEqual(again.sections, parsed.sections);
    assert.deepEqual(again.numberingNeeded, []);
    assert.equal(again.withSections(again.sections, true), output);
});

test("replaces stale separators while preserving inline and unrelated comments", () => {
    const source = page(
        articles
            .replace(
                "; SITE : zh",
                [
                    "<!-- Article 98 -->",
                    "<!-- Article 97 -->",
                    "<!-- Review 36 -->",
                    "; SITE : zh",
                ].join("\n"),
            )
            .replace(
                "; note : A separate note",
                "; note : A separate note <!-- Article 96 -->",
            )
            .replace(
                "<!-- Keep this separator. -->",
                "<!-- Article 95 was removed. -->",
            )
            .replace("\n}}", "\n<!-- Article 94 -->\n}}"),
    );
    const parsed = parseContributions(source);
    const output = parsed.withSections([], true);
    assert.deepEqual(output.match(/^<!-- Article \d+ -->$/gmu), [
        "<!-- Article 02 -->",
        "<!-- Article 01 -->",
    ]);
    assert.doesNotMatch(output, /<!-- Review 36 -->/u);
    assert.match(output, /; note : A separate note <!-- Article 96 -->/u);
    assert.match(output, /<!-- Article 95 was removed\. -->/u);
    assert.deepEqual(parseContributions(output).sections, parsed.sections);
});

test("renumbers after a move and removes the last record marker in an empty section", () => {
    const original = parseContributions(
        page(working, articles, reviews),
    ).withSections([], true);
    const parsed = parseContributions(original);
    const edited = structuredClone(parsed.sections);
    moveCompletedEntry(
        edited,
        edited[0].entries[0].id,
        "articles",
        new Date(2026, 11, 1),
    );
    const output = parsed.withSections(edited.slice(0, 2), true);

    assert.doesNotMatch(output, /<!-- In progress \d+ -->/u);
    assert.deepEqual(output.match(/^<!-- Article \d+ -->$/gmu), [
        "<!-- Article 03 -->",
        "<!-- Article 02 -->",
        "<!-- Article 01 -->",
    ]);
    assert.match(output, /<!-- Review 01 -->\n; title : Talk:Review subject/u);
    assert.deepEqual(parseContributions(output).numberingNeeded, []);
});

test("adds a physical blank separator before the first marker when data starts on the next line", () => {
    const source = page(working.replace("|data=\n\n", "|data=\n"));
    const output = parseContributions(source).withSections([], true);
    assert.equal(
        output,
        source.replace(
            "|data=\n; title",
            "|data=\n\n<!-- In progress 01 -->\n; title",
        ),
    );
});
