import assert from "node:assert/strict";
import test from "node:test";

import {
    findFileReferences,
    mirrorToDraft,
    publishDraft,
} from "../src/draft-copy/wikitext.ts";

const namespaceIds = {
    category: 14,
    分类: 14,
    分類: 14,
    file: 6,
    image: 6,
    template: 10,
    模板: 10,
    文件: 6,
    檔案: 6,
    图像: 6,
    圖像: 6,
};

const articleName = "例子（条目）";
const draftHeader = [
    `{{Draft|${articleName}}}`,
    "{{Todo|inner=",
    "}}",
    "{{Section sizes|bytes_heatmap=ignore_appendices}}",
    "",
    "",
].join("\n");

function mirrorWithLocalFiles(source, localTitles) {
    const references = findFileReferences(source, namespaceIds);
    const localReferences = references.filter(({ title }) =>
        localTitles.includes(title),
    );
    return mirrorToDraft(source, articleName, localReferences, namespaceIds);
}

test("copy to draft adds the header and reversibly wraps categories and local files", () => {
    const source = [
        "导言",
        "",
        "{{Infobox",
        "| image = 封面.png <!-- 原有注释 -->",
        "| caption = 图注",
        "}}",
        "",
        "[[檔案:剧照.jpg|thumb|说明链接到[[条目|标签]]]]",
        "[[File:Shared.jpg|frameless|alt=示例]]",
        "",
        "[[分類:初始列表|排序]]",
        "[[Category:存量]]",
        "",
    ].join("\n");

    const references = findFileReferences(source, namespaceIds);
    assert.deepEqual(
        references.map(({ start, end, title }) => [
            title,
            source.slice(start, end),
        ]),
        [
            ["封面.png", "封面.png"],
            ["剧照.jpg", "[[檔案:剧照.jpg|thumb|说明链接到[[条目|标签]]]]"],
            ["Shared.jpg", "[[File:Shared.jpg|frameless|alt=示例]]"],
        ],
    );

    const draft = mirrorWithLocalFiles(source, ["封面.png", "剧照.jpg"]);
    assert.equal(
        draft,
        draftHeader +
            [
                "导言",
                "",
                "{{Infobox",
                "| image = <!-- 封面.png // 根據[[WP:NFCC#9]]無效化檔案 --> <!-- 原有注释 -->",
                "| caption = 图注",
                "}}",
                "",
                "<!-- [[檔案:剧照.jpg|thumb|说明链接到[[条目|标签]]]] // 根據[[WP:NFCC#9]]無效化檔案 -->",
                "[[File:Shared.jpg|frameless|alt=示例]]",
                "",
                "{{Draft categories|[[分類:初始列表|排序]]",
                "[[Category:存量]]}}",
                "",
            ].join("\n"),
    );
    assert.equal(publishDraft(draft, namespaceIds), source);
});

test("file detection and publishing leave literal markup and ordinary comments intact", () => {
    const source = [
        "<!-- [[File:Comment.png|thumb]] [[Category:注释]] -->",
        "<nowiki>[[图像:Literal.png|thumb]] [[分类:字面值]]</nowiki>",
        '<syntaxhighlight lang="wikitext">',
        "[[File:Code.png]] [[Category:代码]]",
        "</syntaxhighlight>",
        "[[:File:Local.png|文件说明]] [[:分類:分类|分类链接]]",
        "<!-- 临时隐藏的说明 // 其他编辑原因 -->",
        "",
    ].join("\n");

    assert.deepEqual(findFileReferences(source, namespaceIds), []);
    const draft = mirrorWithLocalFiles(source, [
        "Comment.png",
        "Literal.png",
        "Code.png",
        "Local.png",
    ]);
    assert.equal(draft, draftHeader + source);
    assert.equal(publishDraft(draft, namespaceIds), source);
});

test("a local file comment safely contains an existing comment in its caption", () => {
    const source = "[[File:Local.png|thumb|<!-- 内部备注 -->图注 &amp;]]";
    const draft = mirrorWithLocalFiles(source, ["Local.png"]);
    const body = draft.slice(draftHeader.length);

    assert.ok(body.startsWith("<!-- [[File:Local.png|thumb|"));
    assert.ok(body.endsWith(" // 根據[[WP:NFCC#9]]無效化檔案 -->"));
    assert.equal(body.indexOf("-->"), body.length - 3);
    assert.equal(publishDraft(draft, namespaceIds), source);
});

test("copy to draft disables only the local entries of a gallery and preserves line endings", () => {
    const source = [
        '<gallery mode="packed">',
        "圖像:本地图.jpg|图注包含[[条目|内链]]",
        "Shared.png|共享媒体",
        "</gallery>",
        "",
    ].join("\r\n");

    const draft = mirrorWithLocalFiles(source, ["本地图.jpg"]);
    assert.equal(
        draft,
        draftHeader.replaceAll("\n", "\r\n") +
            [
                '<gallery mode="packed">',
                "<!-- 圖像:本地图.jpg|图注包含[[条目|内链]] // 根據[[WP:NFCC#9]]無效化檔案 -->",
                "Shared.png|共享媒体",
                "</gallery>",
                "",
            ].join("\r\n"),
    );
    assert.equal(publishDraft(draft, namespaceIds), source);
});

test("copy to draft disables the whole image map when its image is local", () => {
    const source = [
        "<imagemap>",
        "File:Local.png|400px|图注",
        "rect 0 0 20 10 [[条目|目的页]]",
        "desc none",
        "</imagemap>",
    ].join("\n");

    const draft = mirrorWithLocalFiles(source, ["Local.png"]);
    assert.equal(
        draft,
        draftHeader + `<!-- ${source} // 根據[[WP:NFCC#9]]無效化檔案 -->`,
    );
    assert.equal(publishDraft(draft, namespaceIds), source);
});

test("publishing retains edits to the copied body and category sort keys", () => {
    const source =
        "导言\n[[File:Local.png|thumb|原有图注]]\n[[分类:例子|原有排序键]]\n";
    const draft = mirrorWithLocalFiles(source, ["Local.png"])
        .replace("导言", "改过的导言\n\n== 新段落 ==\n草稿中的内容")
        .replace("原有图注", "草稿图注")
        .replace("原有排序键", "草稿排序键");

    assert.equal(
        publishDraft(draft, namespaceIds),
        [
            "改过的导言",
            "",
            "== 新段落 ==",
            "草稿中的内容",
            "[[File:Local.png|thumb|草稿图注]]",
            "[[分类:例子|草稿排序键]]",
            "",
        ].join("\n"),
    );
});

test("publishing removes section sizes templates even when the article already contained one", () => {
    const source =
        "{{Section sizes|bytes_heatmap=ignore_appendices}}\n\n原有导言";
    const draft = mirrorWithLocalFiles(source, []);

    assert.equal(draft, draftHeader + source);
    assert.equal(publishDraft(draft, namespaceIds), "原有导言");
});

test("publishing removes a populated todo and restores images and categories from a draft", () => {
    const draft = [
        "{{Draft|火焰之纹章 万缕千丝}}",
        "{{Todo|inner=",
        "* [https://example.org/reviews?platform=switch 来源] {{small|待检查}}",
        '* <span style="color: gray;" title="备注">检查编辑冲突</span>',
        "}}",
        "{{Section sizes|bytes_heatmap=ignore_appendices}}",
        "",
        "{{cite check|time=2026-11-22}}",
        "",
        "{{Infobox video game",
        "| image = <!-- Fire Emblem Fortune's Weave Boxart.png // 根據[[WP:NFCC#9]]無效化檔案 -->",
        "| caption = 游戏封面",
        "}}",
        "",
        "正文。",
        "",
        "{{DEFAULTSORT:Fire Emblem}}",
        "{{Draft categories|1=",
        "[[Category:电子游戏]]",
        "[[:分類:策略遊戲|排序]]",
        "}}",
        "",
        "{{videogame-stub}}",
    ].join("\n");

    const article = [
        "{{cite check|time=2026-11-22}}",
        "",
        "{{Infobox video game",
        "| image = Fire Emblem Fortune's Weave Boxart.png",
        "| caption = 游戏封面",
        "}}",
        "",
        "正文。",
        "",
        "{{DEFAULTSORT:Fire Emblem}}",
        "[[Category:电子游戏]]",
        "[[分類:策略遊戲|排序]]",
        "",
        "{{videogame-stub}}",
    ].join("\n");

    assert.equal(publishDraft(draft, namespaceIds), article);
    assert.equal(publishDraft(article, namespaceIds), article);
});

test("publishing removes all page-level draft templates wherever they appear", () => {
    const draft = [
        "<!-- 留下普通注释 -->",
        "{{模板:TODO|inner=先检查 {{small|这条}}}}",
        "{{cite check|time=2026-11-22}}",
        "{{SECTION_SIZES|different=setting}}",
        "",
        "正文第一段。",
        "",
        "{{Todo|inner=第二项}}",
        "",
        "正文第二段。",
        "段内 {{Draft|例子}} 保留两侧文字。",
        "<nowiki>{{Todo|inner=示例}}</nowiki>",
        "<ref>{{Todo|inner=参考资料中的示例}}</ref>",
        "{{Quote|1={{Todo|inner=嵌套示例}}}}",
    ].join("\n");

    assert.equal(
        publishDraft(draft, namespaceIds),
        [
            "<!-- 留下普通注释 -->",
            "{{cite check|time=2026-11-22}}",
            "",
            "正文第一段。",
            "",
            "正文第二段。",
            "段内  保留两侧文字。",
            "<nowiki>{{Todo|inner=示例}}</nowiki>",
            "<ref>{{Todo|inner=参考资料中的示例}}</ref>",
            "{{Quote|1={{Todo|inner=嵌套示例}}}}",
        ].join("\n"),
    );
});

test("publishing removes separated draft templates without damaging CRLF paragraph breaks", () => {
    const draft = [
        `{{Draft|${articleName}}}`,
        "",
        "{{Todo|inner=",
        "* 待处理",
        "}}",
        "{{Section sizes}}",
        "",
        "第一段。",
        "{{Todo|inner=另一项}}",
        "",
        "第二段。",
    ].join("\r\n");

    assert.equal(
        publishDraft(draft, namespaceIds),
        "第一段。\r\n\r\n第二段。",
    );
});
