import assert from "node:assert/strict";
import test from "node:test";
import { renderContributionItem } from "../src/meta-contributions/contributions.ts";
import {
    parseProfileRecords,
    renderProfileRecordItem,
} from "../src/meta-contributions/profile-records.ts";

const leadPrefix = [
    "Profile introduction.",
    "<!--",
    "== Hidden heading ==",
    "{{/|userboxes|data=Ignored inside a comment}}",
    "-->",
    "{{/|annouments|data=Unrelated lead template}}",
    "{{/|userboxes|data=",
    "",
].join("\r\n");
const leadSuffix = [
    "",
    "|site=zh}}",
    "{{/|wd|Q1}}",
    "=== Later subsection ===",
    "{{/|userboxes|data=Ignored after the lead}}",
    "",
].join("\r\n");
const data = [
    "",
    "; Badge : [[File:Blue icon.svg|18px]]",
    "; color : #84A6C8",
    "; text : A {{Label|name=blue}} badge",
    ": on two lines",
    "; tip : Original tooltip <!-- Keep this comment. -->",
    "; metadata : Keep this field.",
    "",
    "; badge : fr",
    "; level : 2",
    "; tone : gray",
    "; text : This user understands French.",
    "",
].join("\r\n");

test("reads Userboxes from the lead and updates only the selected field bytes", () => {
    const source = leadPrefix + data + leadSuffix;
    const section = parseProfileRecords(source, "userboxes");
    assert.deepEqual(section.entries, [
        {
            id: "userboxes:1",
            fields: {
                badge: "[[File:Blue icon.svg|18px]]",
                color: "#84A6C8",
                text: "A {{Label|name=blue}} badge\non two lines",
                tip: "Original tooltip",
                level: "",
                tone: "",
            },
        },
        {
            id: "userboxes:2",
            fields: {
                badge: "fr",
                color: "",
                text: "This user understands French.",
                tip: "",
                level: "2",
                tone: "gray",
            },
        },
    ]);
    assert.equal(
        section.withEntries(structuredClone(section.entries)),
        source,
    );

    const entries = structuredClone(section.entries);
    entries[0].fields.tip = "Edited tooltip";
    entries[1].fields.tone = "yellow";
    assert.equal(
        section.withEntries(entries),
        leadPrefix +
            data
                .replace("Original tooltip", "Edited tooltip")
                .replace("; tone : gray", "; tone : yellow") +
            leadSuffix,
    );
});

test("adds, reorders and removes Userboxes with either a badge or main text", () => {
    const prefix =
        "{{/|1=userboxes|data=\n\n<!-- Keep this lead comment. -->\n\n";
    const suffix = "}}\n== Barnstars ==\n{{/|barnstars|data=}}\n";
    const textBox = {
        id: "new-text",
        fields: { text: "A [[page|label]]\non two lines" },
    };
    const badgeBox = {
        id: "new-badge",
        fields: { badge: "{{Icon|size=18}}" },
    };
    const section = parseProfileRecords(prefix + suffix, "userboxes");
    assert.deepEqual(section.entries, []);
    assert.throws(
        () =>
            section.withEntries([
                {
                    id: "missing-content",
                    fields: { color: "#123", badge: " " },
                },
            ]),
        /requires badge or text/u,
    );
    assert.throws(
        () =>
            section.withEntries([
                {
                    id: "missing-content",
                    fields: { text: "<!-- Add text here. -->" },
                },
            ]),
        /requires badge or text/u,
    );

    const added = section.withEntries([textBox, badgeBox]);
    assert.equal(
        added,
        `${prefix}; text : A [[page|label]]\n: on two lines\n\n; badge : {{Icon|size=18}}\n\n${suffix}`,
    );
    const edited = parseProfileRecords(added, "userboxes");
    const [textEntry, badgeEntry] = edited.entries;
    assert.equal(
        edited.withEntries([badgeEntry, textEntry]),
        `${prefix}; badge : {{Icon|size=18}}\n\n; text : A [[page|label]]\n: on two lines\n\n${suffix}`,
    );
    assert.equal(edited.withEntries([]), `${prefix}\n\n${suffix}`);
    assert.throws(
        () =>
            edited.withEntries([
                { ...textEntry, fields: { text: "Unescaped | delimiter" } },
                badgeEntry,
            ]),
        /escape literal pipes/u,
    );
});

test("requires one Userboxes template in the lead", () => {
    assert.throws(
        () => parseProfileRecords(leadSuffix, "userboxes"),
        /Expected one userboxes profile template/u,
    );
    const block = "{{/|userboxes|data=}}";
    assert.throws(
        () => parseProfileRecords(`${block}\n${block}`, "userboxes"),
        /Expected one userboxes profile template/u,
    );
    assert.deepEqual(parseProfileRecords(block, "userboxes").entries, []);
});

test("preserves existing records with only optional fields", () => {
    const source = "{{/|userboxes|data=\n; color : #123\n}}";
    const section = parseProfileRecords(source, "userboxes");
    assert.equal(section.withEntries(section.entries), source);

    const [entry] = section.entries;
    assert.equal(
        section.withEntries([
            { ...entry, fields: { ...entry.fields, color: "#456" } },
        ]),
        source.replace("#123", "#456"),
    );
});

const workingEntry = {
    id: "working:1",
    site: "",
    title: " Draft:Glass River ",
    label: "",
    status: "",
    date: "",
    type: "draft",
    draft: "",
    talk: "",
    notes: [
        "{{/|trans|en|Glass River|Example editor|partly=yes}}",
        " See [[Revision history|the history]]\r\n for more details. ",
    ],
};

test("renders a single contribution using its group mode, default site, and notes", () => {
    assert.equal(
        renderContributionItem("working", " ZH ", workingEntry),
        [
            "{{/|working|site=zh|data=",
            "; title : Draft:Glass River",
            "; type : draft",
            "; note : {{/|trans|en|Glass River|Example editor|partly=yes}}",
            "; note : See [[Revision history|the history]]",
            ": for more details.",
            "}}",
        ].join("\n"),
    );

    const completed = {
        ...workingEntry,
        site: "fr",
        type: "",
        title: "Glass River",
        notes: [],
    };
    for (const group of ["articles", "reviews"]) {
        assert.equal(
            renderContributionItem(group, "en|data=broken", completed),
            [
                "{{/|contributions|site=en|data=",
                "; site : fr",
                "; title : Glass River",
                "}}",
            ].join("\n"),
        );
    }
});

test("renders standalone Barnstar, Quotation and Userbox templates", () => {
    const entry = (fields) => ({ id: "preview-record", fields });
    assert.equal(
        renderProfileRecordItem(
            "barnstars",
            "ja",
            entry({ file: "Example.svg", by: "Editor" }),
        ),
        "{{/|barnstars|site=ja|data=\n; file : Example.svg\n; by : Editor\n}}",
    );
    assert.equal(
        renderProfileRecordItem(
            "quotations",
            "",
            entry({ text: "First line\nSecond line" }),
        ),
        "{{/|quotations|data=\n; text : First line\n: Second line\n}}",
    );
    assert.equal(
        renderProfileRecordItem(
            "userboxes",
            "",
            entry({ badge: "[[File:Icon.svg|16px]]", color: "#124" }),
        ),
        "{{/|userboxes|data=\n; badge : [[File:Icon.svg|16px]]\n; color : #124\n}}",
    );
});

test("serializes pasted multiline quotation highlights as literal line breaks and preserves existing fields", () => {
    const source = [
        "== Quotations ==",
        "{{/|quotations|data=",
        "; text : The original",
        "; text-link-label : See original",
        "; text-find : First line",
        ": Second line",
        "; trans-link-label : See translation",
        "; trans-find : Première ligne\\nDernière ligne",
        "}}",
    ].join("\n");
    const section = parseProfileRecords(source, "quotations");
    const [original] = section.entries;
    assert.equal(section.withEntries(section.entries), source);

    const entry = {
        ...original,
        fields: {
            ...original.fields,
            "text-find": " First line\r\n Middle line\nLast line ",
            "trans-find": "Première ligne\rNouvelle ligne",
        },
    };
    assert.equal(
        section.withEntries([entry]),
        source
            .replace(
                "First line\n: Second line",
                "First line\\nMiddle line\\nLast line",
            )
            .replace(
                "Première ligne\\nDernière ligne",
                "Première ligne\\nNouvelle ligne",
            ),
    );
    const preview = renderProfileRecordItem("quotations", "", entry);
    assert.match(
        preview,
        /^; text-find : First line\\nMiddle line\\nLast line$/mu,
    );
    assert.match(
        preview,
        /^; trans-find : Première ligne\\nNouvelle ligne$/mu,
    );
    assert.match(preview, /^; text-link-label : See original$/mu);
    assert.match(preview, /^; trans-link-label : See translation$/mu);
});

test("validates required preview fields and protects the template delimiters", () => {
    assert.throws(
        () =>
            renderContributionItem("working", "en", {
                ...workingEntry,
                type: "",
            }),
        /needs an activity type/u,
    );
    assert.throws(
        () =>
            renderContributionItem("articles", "en", {
                ...workingEntry,
                title: "<!-- Blank -->",
            }),
        /needs a title/u,
    );
    assert.throws(
        () =>
            renderContributionItem("working", "en", {
                ...workingEntry,
                notes: ["Unescaped | pipe"],
            }),
        /escape literal pipes/u,
    );
    assert.throws(
        () =>
            renderProfileRecordItem("barnstars", "en", {
                id: "empty",
                fields: {},
            }),
        /requires file/u,
    );
    assert.throws(
        () =>
            renderProfileRecordItem("userboxes", "", {
                id: "empty",
                fields: { text: "<!-- Blank -->" },
            }),
        /requires badge or text/u,
    );
    assert.throws(
        () =>
            renderProfileRecordItem("quotations", "", {
                id: "unclosed",
                fields: { text: "{{Link" },
            }),
        /Balance wikitext brackets/u,
    );
});
