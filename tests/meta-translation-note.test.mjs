import assert from "node:assert/strict";
import test from "node:test";

import {
    invalidTranslationField,
    parseTranslationNote,
    serializeTranslationNote,
} from "../src/meta-contributions/translation-note.ts";

test("parses a simple translation note and retains the source on an unchanged save", () => {
    const source =
        " {{ / | trans | EN | ''Sample_game''#An_anchor | First editor | Second editor | partly = yes }} ";
    const note = parseTranslationNote(source);
    assert.deepEqual(note, {
        site: "en",
        title: "''Sample game''#An_anchor",
        authors: "First editor\nSecond editor",
        partly: true,
        source,
    });
    assert.equal(serializeTranslationNote(note), source);
    assert.equal(
        serializeTranslationNote({ ...note, partly: false }),
        "{{/|trans|en|''Sample game''#An_anchor|First editor|Second editor}}",
    );
});

test("supports an empty author list and normalizes whitespace and language codes for a new note", () => {
    const note = {
        site: " Zh-Min-Nan ",
        title: " Sample_article ",
        authors: "\r\n  ",
        partly: true,
    };
    assert.equal(invalidTranslationField(note), null);
    assert.equal(
        serializeTranslationNote(note),
        "{{/|trans|zh-min-nan|Sample article|partly=yes}}",
    );
    const old = "{{/|trans|en|Sample article|partly=no}}";
    assert.equal(serializeTranslationNote(parseTranslationNote(old)), old);
});

test("keeps equals signs in titles and author names in the correct positional slots", () => {
    const note = {
        site: "en",
        title: "A=B",
        authors: "Editor one\r\n\r\nEditor=two",
        partly: false,
    };
    const source = "{{/|trans|en|3=A=B|4=Editor one|5=Editor=two}}";
    assert.equal(serializeTranslationNote(note), source);
    assert.deepEqual(parseTranslationNote(source), {
        ...note,
        authors: "Editor one\nEditor=two",
        source,
    });
    assert.equal(
        serializeTranslationNote({ ...note, title: "A" }),
        "{{/|trans|en|A|Editor one|5=Editor=two}}",
    );
});

test("leaves compound, ambiguous, or extended translation wikitext for the raw editor", () => {
    for (const source of [
        "Based on {{/|trans|en|Sample article}}",
        "{{/|trans|en|Sample article}}<!-- extra detail -->",
        "{{/|trans|en|[[Sample article]]}}",
        "{{/|trans|en|Sample article|{{User|Editor}}}}",
        "{{/|trans|en|Sample article|partly=Yes}}",
        "{{/|trans|en|Sample article|1=trans}}",
        "{{/|trans|en|Sample article|5=Editor}}",
        "{{/|trans|en|Sample article||Editor}}",
        "{{/|trans|en|Sample article|custom=yes}}",
    ])
        assert.equal(parseTranslationNote(source), null, source);
});

test("flags unsafe arguments by field before serialization", () => {
    const valid = {
        site: "en",
        title: "Sample article",
        authors: "Editor",
        partly: false,
    };
    for (const [key, value] of [
        ["site", "en.wikipedia.org"],
        ["title", "A|partly=yes"],
        ["title", "#Section only"],
        ["title", "'' ''"],
        ["title", "Title\nNew line"],
        ["authors", "Editor\nSecond editor}}"],
        ["authors", "Editor#Section"],
    ]) {
        const note = { ...valid, [key]: value };
        assert.equal(invalidTranslationField(note), key);
        assert.throws(() => serializeTranslationNote(note), RangeError);
    }
});
