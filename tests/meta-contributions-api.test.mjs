import assert from "node:assert/strict";
import test from "node:test";
import {
    MetaContributionsError,
    PROFILE_OWNER,
    PROFILE_TITLE,
    profileItemSource,
    readMetaProfile,
} from "../src/meta-contributions/meta-api.ts";

const baseRevision = 125;
const renderedPreview =
    '<div class="mw-parser-output"><h2 id="Contributions">Contributions</h2></div>';
const profile = [
    "Profile introduction.",
    "",
    "== Contributions ==",
    "",
    "=== In progress ===",
    "",
    "{{/|working|site=zh|data=",
    "",
    "<!-- In progress 01 -->",
    "; title : Harbor Lights",
    "; type : draft",
    "",
    "}}",
    "",
    "=== Articles ===",
    "",
    "{{/|contributions|site=zh|data=",
    "",
    "<!-- Article 01 -->",
    "; title : Glass River",
    "; status : b",
    "; date : 2026-11",
    "",
    "}}",
    "",
    "=== Reviews ===",
    "",
    "{{/|contributions|site=zh|data=",
    "",
    "<!-- Review 01 -->",
    "; title : Talk:Paper Garden#Review",
    "; status : pr",
    "; date : 2026-10",
    "",
    "}}",
    "",
    "== Other ==",
    "Unrelated profile text.",
].join("\n");
const fullProfile = [
    "{{/|userboxes|data=",
    "",
    "<!-- Garden userbox -->",
    "; badge : GR",
    "; color : #ccc",
    "; text : I garden.",
    "",
    "}}",
    "",
    profile,
    "",
    "== Barnstars ==",
    "{{/|barnstars|site=zh|data=",
    "",
    "<!-- Garden award -->",
    "; file : Garden award.svg",
    "; label : Garden award",
    "; extra : Preserve this field.",
    "",
    "}}",
    "",
    "== Quotations ==",
    "{{/|quotations|show=1|data=",
    "",
    "; text : The garden is quiet.",
    "; author : Jane Gardener",
    "",
    "; text : The river keeps moving.",
    "",
    "}}",
].join("\n");

function fakeMeta({
    source = profile,
    saveError,
    previewError,
    previewResponse = { parse: { text: renderedPreview } },
} = {}) {
    const reads = [];
    const parses = [];
    const writes = [];
    return {
        reads,
        parses,
        writes,
        async get(parameters) {
            reads.push(parameters);
            return {
                query: {
                    pages: [
                        {
                            ns: 2,
                            title: PROFILE_TITLE,
                            revisions: [
                                {
                                    revid: baseRevision,
                                    slots: {
                                        main: {
                                            contentmodel: "wikitext",
                                            content: source,
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            };
        },
        async post(parameters) {
            parses.push(parameters);
            if (previewError) throw previewError;
            return previewResponse;
        },
        async postWithEditToken(parameters) {
            writes.push(parameters);
            if (saveError) throw saveError;
            return { edit: { result: "Success", newrevid: 128 } };
        },
    };
}

test("the editor reads Meta as the profile owner and sends only explicit changes", async () => {
    const api = fakeMeta();
    const editor = await readMetaProfile(api);
    assert.equal(api.reads[0].titles, PROFILE_TITLE);
    assert.equal(api.reads[0].assertuser, PROFILE_OWNER);
    assert.equal(editor.contributions.needsNumbering, false);
    assert.deepEqual(api.writes, []);

    const unchanged = await editor.save({
        contributions: structuredClone(editor.contributions.sections),
    });
    assert.match(unchanged, /PermaLink\/125#Contributions$/);
    assert.deepEqual(api.writes, []);

    const edited = structuredClone(editor.contributions.sections);
    edited.find(({ id }) => id === "articles").entries[0].date = "2026-12";
    const saved = await editor.save({ contributions: edited });

    assert.equal(
        saved,
        "https://meta.wikimedia.org/wiki/Special:PermaLink/128#Contributions",
    );
    assert.deepEqual(api.writes, [
        {
            action: "edit",
            title: PROFILE_TITLE,
            text: profile.replace("date : 2026-11", "date : 2026-12"),
            summary:
                "/* Articles */ Changed the date for “Glass River” from November 2026 to December 2026.",
            baserevid: baseRevision,
            nocreate: true,
            watchlist: "nochange",
            assert: "user",
            assertuser: PROFILE_OWNER,
        },
    ]);
});

test("preview and save can fill in numbered comments in all three sections without changing entries", async () => {
    const api = fakeMeta({
        source: profile.replace(
            /^<!-- (?:In progress|Article|Review) 01 -->\n/gmu,
            "",
        ),
    });
    const editor = await readMetaProfile(api);
    assert.equal(editor.contributions.needsNumbering, true);
    assert.equal(
        editor.contributions.suggestSummary(editor.contributions.sections),
        "/* Contributions */ Updated the numbered separators in the source.",
    );

    await editor.preview({ contributions: editor.contributions.sections });
    assert.equal(api.parses[0].text, profile);
    assert.deepEqual(api.writes, []);
    await editor.save({ contributions: editor.contributions.sections });
    assert.equal(api.writes[0].text, api.parses[0].text);
    assert.equal(
        api.writes[0].summary,
        editor.contributions.suggestSummary(editor.contributions.sections),
    );
});

test("save sends a user-edited summary in place of the suggestion", async () => {
    const api = fakeMeta();
    const editor = await readMetaProfile(api);
    const edited = structuredClone(editor.contributions.sections);
    edited
        .find(({ id }) => id === "working")
        .entries[0].notes.push("Draft in progress.");

    await editor.save(
        { contributions: edited },
        "  /* In progress */ Add a note about the draft.  ",
    );
    assert.equal(
        api.writes[0].summary,
        "/* In progress */ Add a note about the draft.",
    );
});

test("preview parses the proposed edit under the profile title before any write", async () => {
    const api = fakeMeta();
    const editor = await readMetaProfile(api);
    const edited = structuredClone(editor.contributions.sections);
    edited.find(({ id }) => id === "articles").entries[0].date = "2026-12";

    assert.equal(
        (await editor.preview({ contributions: edited })).html,
        renderedPreview,
    );
    assert.deepEqual(api.parses, [
        {
            action: "parse",
            formatversion: 2,
            title: PROFILE_TITLE,
            text: profile.replace("date : 2026-11", "date : 2026-12"),
            contentmodel: "wikitext",
            prop: "text",
            preview: true,
            disableeditsection: true,
            disabletoc: true,
            assert: "user",
            assertuser: PROFILE_OWNER,
        },
    ]);
    assert.deepEqual(api.writes, []);

    await editor.save({ contributions: edited });
    assert.equal(api.writes[0].text, api.parses[0].text);
    assert.equal(api.writes[0].baserevid, baseRevision);
});

test("preview validates changed fields before parsing and reports parse and account errors", async () => {
    const api = fakeMeta();
    const editor = await readMetaProfile(api);
    const invalid = structuredClone(editor.contributions.sections);
    invalid[0].entries[0].title = "";
    const hasKey = (key) => (error) =>
        error instanceof MetaContributionsError && error.key === key;

    await assert.rejects(
        editor.preview({ contributions: invalid }),
        hasKey("invalidFields"),
    );
    assert.deepEqual(api.parses, []);

    const cases = [
        [fakeMeta({ previewError: "assertnameduserfailed" }), "signIn"],
        [fakeMeta({ previewError: "parseerror" }), "previewFailed"],
        [
            fakeMeta({
                previewResponse: { parse: { text: { "*": renderedPreview } } },
            }),
            "previewFailed",
        ],
    ];
    for (const [failedApi, key] of cases) {
        const failed = await readMetaProfile(failedApi);
        await assert.rejects(
            failed.preview({ contributions: failed.contributions.sections }),
            hasKey(key),
        );
        assert.deepEqual(failedApi.writes, []);
    }
});

test("preview and save reject assessment codes from another section on new or modified entries", async () => {
    const api = fakeMeta();
    const editor = await readMetaProfile(api);
    const invalidFields = (error) =>
        error instanceof MetaContributionsError &&
        error.key === "invalidFields";

    for (const [sectionId, status] of [
        ["articles", "ce"],
        ["reviews", "b"],
    ]) {
        const edited = structuredClone(editor.contributions.sections);
        const { entries } = edited.find(({ id }) => id === sectionId);
        const [original] = entries;

        entries[0] = { ...original, status };
        await assert.rejects(
            editor.preview({ contributions: edited }),
            invalidFields,
            `modified ${sectionId} with ${status}`,
        );
        await assert.rejects(
            editor.save({ contributions: edited }),
            invalidFields,
            `modified ${sectionId} with ${status}`,
        );

        entries[0] = original;
        entries.unshift({
            ...original,
            id: "new",
            title: "New contribution",
            status,
        });
        await assert.rejects(
            editor.preview({ contributions: edited }),
            invalidFields,
            `new ${sectionId} with ${status}`,
        );
        await assert.rejects(
            editor.save({ contributions: edited }),
            invalidFields,
            `new ${sectionId} with ${status}`,
        );
    }
    assert.deepEqual(api.parses, []);
    assert.deepEqual(api.writes, []);
});

test("preview and save preserve existing assessment codes when editing other fields", async () => {
    const legacy = profile
        .replace(
            "; status : b",
            "; status : ce <!-- original article status -->",
        )
        .replace(
            "; status : pr",
            "; status : b <!-- original review status -->",
        );
    const api = fakeMeta({ source: legacy });
    const editor = await readMetaProfile(api);
    const edited = structuredClone(editor.contributions.sections);
    edited.find(({ id }) => id === "articles").entries[0].date = "2026-12";
    edited.find(({ id }) => id === "reviews").entries[0].date = "2026-11";
    const expected = legacy
        .replace("date : 2026-11", "date : 2026-12")
        .replace("date : 2026-10", "date : 2026-11");

    await editor.preview({ contributions: edited });
    await editor.save({ contributions: edited });
    assert.equal(api.parses[0].text, expected);
    assert.equal(api.writes[0].text, expected);
});

test("an edit conflict is reported without retrying against a newer revision", async () => {
    const api = fakeMeta({ saveError: "editconflict" });
    const editor = await readMetaProfile(api);
    const edited = structuredClone(editor.contributions.sections);
    edited
        .find(({ id }) => id === "reviews")
        .entries[0].notes.push("Review completed.");

    await assert.rejects(
        editor.save({ contributions: edited }),
        (error) =>
            error instanceof MetaContributionsError &&
            error.key === "conflict",
    );
    assert.equal(api.writes.length, 1);
    assert.equal(api.writes[0].baserevid, baseRevision);
});

test("a mismatched Meta session blocks the contribution editor", async () => {
    await assert.rejects(
        readMetaProfile({
            async get() {
                throw "assertnameduserfailed";
            },
            async post() {
                assert.fail("A mismatched session must not preview.");
            },
            async postWithEditToken() {
                assert.fail("A mismatched session must not save.");
            },
        }),
        (error) =>
            error instanceof MetaContributionsError && error.key === "signIn",
    );
});

test("each inline preview sends only the selected record through the authenticated profile parser", async () => {
    const html =
        '<div class="mw-parser-output"><div class="profile">Selected item</div></div>';
    const api = fakeMeta({
        source: fullProfile,
        previewResponse: { parse: { text: html } },
    });
    const profileEditor = await readMetaProfile(api);
    const {
        id: group,
        defaultSite,
        entries: [working],
    } = profileEditor.contributions.sections[0];
    const cases = [
        [
            {
                section: "contributions",
                group,
                defaultSite,
                entry: {
                    ...working,
                    notes: [
                        "Draft notes\nFollow-up",
                        "{{/|review|en|Harbor Lights|A reviewer}}",
                    ],
                },
            },
            [
                "{{/|working|site=zh|data=",
                "; title : Harbor Lights",
                "; type : draft",
                "; note : Draft notes",
                ": Follow-up",
                "; note : {{/|review|en|Harbor Lights|A reviewer}}",
                "}}",
            ],
        ],
        [
            {
                section: "userboxes",
                defaultSite: "",
                entry: profileEditor.userboxes.entries[0],
            },
            [
                "{{/|userboxes|data=",
                "; badge : GR",
                "; color : #ccc",
                "; text : I garden.",
                "}}",
            ],
        ],
        [
            {
                section: "barnstars",
                defaultSite: "zh",
                entry: profileEditor.barnstars.entries[0],
            },
            [
                "{{/|barnstars|site=zh|data=",
                "; label : Garden award",
                "; file : Garden award.svg",
                "}}",
            ],
        ],
        [
            {
                section: "quotations",
                defaultSite: "",
                entry: profileEditor.quotations.entries[1],
            },
            ["{{/|quotations|data=", "; text : The river keeps moving.", "}}"],
        ],
    ];

    for (const [item, lines] of cases) {
        const source = profileItemSource(item);
        assert.deepEqual(source.split("\n").filter(Boolean), lines);
        assert.equal(await profileEditor.previewItem(source), html);
        const request = api.parses.at(-1);
        assert.equal(request.action, "parse");
        assert.equal(request.title, PROFILE_TITLE);
        assert.equal(request.assert, "user");
        assert.equal(request.assertuser, PROFILE_OWNER);
        assert.equal(
            request.text,
            [
                "{{/|profile_header|lang=en}}",
                source,
                "{{/|profile_footer}}",
            ].join("\n"),
        );
    }
    assert.equal(api.parses.length, cases.length);
    assert.deepEqual(api.writes, []);
});

test("a shared preview and save apply edits from all profile tabs to one base revision", async () => {
    const html = [
        '<ul class="profile-userbox-list"><li>Garden userbox</li></ul>',
        '<h2 id="Contributions">Contributions</h2>',
        '<h2 id="Barnstars">Barnstars</h2>',
        '<h2 id="Quotations">Quotations</h2>',
    ].join("");
    const api = fakeMeta({
        source: fullProfile,
        previewResponse: { parse: { text: html } },
    });
    const profileEditor = await readMetaProfile(api);
    assert.equal(profileEditor.barnstars.defaultSite, "zh");
    const edits = {
        contributions: structuredClone(profileEditor.contributions.sections),
        barnstars: structuredClone(profileEditor.barnstars.entries),
        quotations: structuredClone(profileEditor.quotations.entries),
        userboxes: structuredClone(profileEditor.userboxes.entries),
    };
    edits.contributions[0].entries[0].title = "Harbor Lights in Winter";
    edits.barnstars[0].fields.label = "The Garden Award";
    edits.quotations[1].fields.text = "The river keeps moving, even at night.";
    edits.userboxes[0].fields.text = "I maintain a public garden.";
    const expected = fullProfile
        .replace("title : Harbor Lights", "title : Harbor Lights in Winter")
        .replace("label : Garden award", "label : The Garden Award")
        .replace(
            "text : The river keeps moving.",
            "text : The river keeps moving, even at night.",
        )
        .replace("text : I garden.", "text : I maintain a public garden.");

    const preview = await profileEditor.preview(edits);
    assert.equal(preview.html, html);
    assert.deepEqual(preview.sections.toSorted(), [
        "barnstars",
        "contributions",
        "quotations",
        "userboxes",
    ]);
    for (const name of [
        "Contributions",
        "Barnstars",
        "Quotations",
        "Userboxes",
    ]) {
        assert.ok(preview.suggestedSummary.includes(name));
    }
    assert.equal(api.parses[0].text, expected.replace("show=1", "show=2"));
    assert.deepEqual(api.writes, []);

    assert.match(
        await profileEditor.save(edits, "  Updated four profile tabs.  "),
        /PermaLink\/128$/,
    );
    assert.equal(api.reads.length, 1);
    assert.equal(api.writes.length, 1);
    assert.equal(api.writes[0].text, expected);
    assert.equal(api.writes[0].summary, "Updated four profile tabs.");
    assert.equal(api.writes[0].baserevid, baseRevision);
});

test("a userbox edit uses the lead template and links to the whole saved revision", async () => {
    const html =
        '<ul class="profile-userbox-list"><li>Garden userbox</li></ul>';
    const api = fakeMeta({
        source: fullProfile,
        previewResponse: { parse: { text: html } },
    });
    const profileEditor = await readMetaProfile(api);
    const userboxes = structuredClone(profileEditor.userboxes.entries);
    userboxes[0].fields.color = "#abc";
    const expected = fullProfile.replace("color : #ccc", "color : #abc");

    const preview = await profileEditor.preview({ userboxes });
    assert.deepEqual(preview, {
        html,
        sections: ["userboxes"],
        suggestedSummary: "Updated userboxes.",
    });
    assert.equal(api.parses[0].text, expected);
    assert.deepEqual(api.writes, []);

    assert.match(await profileEditor.save({ userboxes }), /PermaLink\/128$/);
    assert.equal(api.writes[0].text, expected);
    assert.equal(api.writes[0].summary, preview.suggestedSummary);
});

test("a quotation edit preserves an unavailable section and pending Contributions numbering", async () => {
    const source = fullProfile
        .replace("; file : Garden award.svg", "Unexpected barnstar text")
        .replace("<!-- In progress 01 -->\n", "");
    const api = fakeMeta({ source });
    const profileEditor = await readMetaProfile(api);
    assert.equal(profileEditor.barnstars, null);
    assert.equal(profileEditor.contributions.needsNumbering, true);
    const quotations = structuredClone(profileEditor.quotations.entries);
    quotations[1].fields.text = "The river keeps moving in winter.";
    const expected = source.replace(
        "text : The river keeps moving.",
        "text : The river keeps moving in winter.",
    );

    const preview = await profileEditor.preview({ quotations });
    assert.deepEqual(preview.sections, ["quotations"]);
    assert.equal(
        preview.suggestedSummary,
        "/* Quotations */ Updated records.",
    );
    assert.equal(api.parses[0].text, expected.replace("show=1", "show=2"));

    assert.match(
        await profileEditor.save({ quotations }),
        /PermaLink\/128#Quotations$/,
    );
    assert.equal(api.writes[0].text, expected);
    assert.equal(api.writes[0].summary, preview.suggestedSummary);
});

test("a barnstar edit validates required fields before preview and protects the base revision on save", async () => {
    const api = fakeMeta({ source: fullProfile, saveError: "editconflict" });
    const profileEditor = await readMetaProfile(api);
    const barnstars = structuredClone(profileEditor.barnstars.entries);
    barnstars[0].fields.file = "";
    const invalid = (error) =>
        error instanceof MetaContributionsError &&
        error.key === "invalidFields";

    await assert.rejects(profileEditor.preview({ barnstars }), invalid);
    await assert.rejects(profileEditor.save({ barnstars }), invalid);
    assert.deepEqual(api.parses, []);
    assert.deepEqual(api.writes, []);

    barnstars[0].fields.file = "New garden award.svg";
    const preview = await profileEditor.preview({
        barnstars,
        quotations: profileEditor.quotations.entries,
    });
    assert.deepEqual(preview.sections, ["barnstars"]);
    assert.equal(preview.suggestedSummary, "/* Barnstars */ Updated records.");
    assert.equal(
        api.parses[0].text,
        fullProfile.replace(
            "file : Garden award.svg",
            "file : New garden award.svg",
        ),
    );

    await assert.rejects(
        profileEditor.save({ barnstars }),
        (error) =>
            error instanceof MetaContributionsError &&
            error.key === "conflict",
    );
    assert.equal(api.writes.length, 1);
    assert.equal(api.writes[0].baserevid, baseRevision);
});
