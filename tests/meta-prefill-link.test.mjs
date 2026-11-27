import assert from "node:assert/strict";
import test from "node:test";

import { parsePrefillLink } from "../src/meta-contributions/prefill-link.ts";

function link(site, title, fragment = "", label = "") {
    return { site, title, fragment, label };
}

test("accepts plain page titles and preserves local namespace and ordinary colon prefixes", () => {
    assert.deepEqual(
        parsePrefillLink("  草稿:示例_頁面#團隊_紀錄  ", "ZH"),
        link("zh", "草稿:示例 頁面", "團隊_紀錄"),
    );
    assert.deepEqual(parsePrefillLink("Re:Zero", "zh"), link("zh", "Re:Zero"));
    assert.deepEqual(
        parsePrefillLink("WP:Peer_review", "en"),
        link("en", "WP:Peer review"),
    );
    assert.deepEqual(
        parsePrefillLink("Wikipedia:同行評審", "zh"),
        link("zh", "Wikipedia:同行評審"),
    );
    assert.deepEqual(
        parsePrefillLink("CAT:Example", "zh"),
        link("zh", "CAT:Example"),
    );
    assert.deepEqual(parsePrefillLink("A = B", "en"), link("en", "A = B"));
});

test("recognizes wikilink display labels and Wikipedia language prefixes", () => {
    assert.deepEqual(
        parsePrefillLink(
            "[[:w:ZH:討論:測試_條目#評審_區段|''測試顯示'' ]]",
            "en",
        ),
        link("zh", "討論:測試 條目", "評審_區段", "''測試顯示''"),
    );
    assert.deepEqual(
        parsePrefillLink("[[en:Talk:Example#B_class_review]]", "zh"),
        link("en", "Talk:Example", "B_class_review"),
    );
    assert.deepEqual(parsePrefillLink(":zh:示例", "en"), link("zh", "示例"));
    assert.deepEqual(
        parsePrefillLink("[[w:Talk:Example|Label]]", "zh"),
        link("en", "Talk:Example", "", "Label"),
    );
    assert.deepEqual(
        parsePrefillLink(
            "[[wikipedia:en:Article%20name#Section_%C3%89]]",
            "zh",
        ),
        link("en", "Article name", "Section_É"),
    );
    assert.deepEqual(
        parsePrefillLink("[[be-tarask:Вікіпэдыя]]", "zh"),
        link("be-tarask", "Вікіпэдыя"),
    );
});

test("decodes desktop, mobile, and Chinese variant article URLs", () => {
    assert.deepEqual(
        parsePrefillLink(
            "https://en.wikipedia.org/wiki/Talk:Example_page#A_section_%26_more",
            "zh",
        ),
        link("en", "Talk:Example page", "A_section_&_more"),
    );
    assert.deepEqual(
        parsePrefillLink(
            "https://ja.m.wikipedia.org/wiki/%E4%BE%8B_%E3%83%9A%E3%83%BC%E3%82%B8#Detail_%E4%BE%8B",
            "en",
        ),
        link("ja", "例 ページ", "Detail_例"),
    );
    assert.deepEqual(
        parsePrefillLink(
            "https://zh.wikipedia.org/zh-tw/測試_條目#章節_%E4%B8%80",
            "en",
        ),
        link("zh", "測試 條目", "章節_一"),
    );
    assert.deepEqual(
        parsePrefillLink("https://zh.wikipedia.org/zh/示例#段落", "en"),
        link("zh", "示例", "段落"),
    );
});

test("uses the index.php title parameter and does not double-decode target components", () => {
    assert.deepEqual(
        parsePrefillLink(
            "https://en.wikipedia.org/w/index.php?oldid=42&title=Old+Town%3A_Topic#Some_%2520",
            "zh",
        ),
        link("en", "Old Town: Topic", "Some_%20"),
    );
    assert.deepEqual(
        parsePrefillLink(
            "https://zh.wikipedia.org/w/index.php?title=%E8%A9%95%E5%AF%A9%23Part_01",
            "en",
        ),
        link("zh", "評審", "Part_01"),
    );
    assert.equal(
        parsePrefillLink(
            "https://en.wikipedia.org/w/index.php?title=One&title=Two",
            "en",
        ),
        null,
    );
    assert.equal(
        parsePrefillLink(
            "https://en.wikipedia.org/w/index.php?curid=42",
            "en",
        ),
        null,
    );
});

test("rejects foreign origins, unsupported routes, and malformed or unsafe markup", () => {
    for (const input of [
        "",
        "#Anchor_only",
        "[[Title|Label|More]]",
        "[[Title|<b>Label</b>]]",
        "[[Title]] and more text",
        "''Naked markup''",
        "Title|extra",
        "Title\nAnother line",
        "http://en.wikipedia.org/wiki/Title",
        "https://en.wikipedia.org.invalid/wiki/Title",
        "https://en.wikipedia.org@invalid.example/wiki/Title",
        "https://account@en.wikipedia.org/wiki/Title",
        "https://en.wikipedia.org:8443/wiki/Title",
        "https://en.wikipedia.org/zh-hant/Title",
        "https://en.wikipedia.org/w/api.php?title=Title",
        "https://www.wikipedia.org/wiki/Title",
        "https://commons.wikimedia.org/wiki/Title",
        "https://en.wikipedia.org/wiki/Title#%E6%ZZ",
        "https://en.wikipedia.org/wiki/Title#%0AText",
        "https://en.wikipedia.org/wiki/Title%0A",
        "https://en.wikipedia.org/wiki/Title%7cAn_argument",
        "https://en.wikipedia.org/w/index.php?title=%E6%ZZ",
        "ja:javascript:example()",
    ])
        assert.equal(parsePrefillLink(input, "en"), null, input);
});
