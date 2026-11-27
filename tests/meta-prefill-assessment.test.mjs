import assert from "node:assert/strict";
import test from "node:test";

import {
    assessmentFromReviewLink,
    lookupAssessment,
} from "../src/meta-contributions/prefill-assessment.ts";

function articleResult(title, pageassessments) {
    return { query: { pages: [{ ns: 0, title, pageassessments }] } };
}

function talkResult(content) {
    return {
        query: {
            pages: [{ ns: 1, revisions: [{ slots: { main: { content } } }] }],
        },
    };
}

test("site-wide PageAssessments takes precedence over individual WikiProjects", async () => {
    const requests = [];
    const code = await lookupAssessment("示例條目", async (params) => {
        requests.push(params);
        return articleResult("示例条目", {
            电子游戏: { class: "乙" },
            通用評級: { class: "典范" },
        });
    });
    assert.equal(code, "fa");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].prop, "pageassessments");
    assert.equal(requests[0].titles, "示例條目");

    assert.equal(
        await lookupAssessment("Example", async () =>
            articleResult("Example", {
                Science: { class: "B" },
                "Project-independent assessment": { class: "GA" },
            }),
        ),
        "ga",
    );
});

test("a shared result among projects can fill the assessment when there is no general rating", async () => {
    const result = await lookupAssessment("Example", async () =>
        articleResult("Example", {
            "Project One": { class: "B+" },
            "Project Two": { class: "乙上" },
            "Project Three": { class: "Bplus" },
        }),
    );
    assert.equal(result, "bplus");
});

test("Chinese Wikipedia class labels map to their contribution status codes", async () => {
    const classes = [
        ["典範", "fa"],
        ["特色列表", "fl"],
        ["甲", "a"],
        ["甲級列表", "al"],
        ["优良", "ga"],
        ["乙上", "bplus"],
        ["乙", "b"],
        ["乙级列表", "bl"],
        ["丙", "c"],
        ["丙級列表", "cl"],
        ["初", "start"],
        ["列表", "list"],
        ["小作品", "stub"],
        ["小列表", "sl"],
    ];
    for (const [label, code] of classes) {
        assert.equal(
            await lookupAssessment("示例条目", async () =>
                articleResult("示例条目", {
                    通用评级: { class: label },
                }),
            ),
            code,
            label,
        );
    }
});

test("a recognized banner shell supplies the current class when project assessments cannot", async () => {
    const calls = [];
    const result = await lookupAssessment("Alternate", async (params) => {
        calls.push([params.prop, params.titles]);
        if (params.prop === "pageassessments") {
            return articleResult("Canonical", {
                Science: { class: "C" },
                Biology: { class: "Stub" },
            });
        }
        return talkResult(
            [
                "<!-- {{WPBS|class=GA}} -->",
                "<nowiki>{{WikiProject banner shell|class=Stub}}</nowiki>",
                "{{WPBS|class=FA|class=AL<!-- agreed on talk -->|1={{Example project|class=GA}}}}",
            ].join("\n"),
        );
    });
    assert.deepEqual(calls, [
        ["pageassessments", "Alternate"],
        ["revisions", "Talk:Canonical"],
    ]);
    assert.equal(result, "al");
});

test("unknown and conflicting metadata leave the assessment blank", async () => {
    assert.equal(
        await lookupAssessment("Example", async (params) => {
            if (params.prop === "pageassessments")
                throw new Error("Unrecognized query module");
            return talkResult(
                "{{Unrelated template|class=FA}}\n{{WPBS|class=Unassessed}}",
            );
        }),
        "",
    );
    assert.equal(
        await lookupAssessment("Example", async (params) => {
            if (params.prop === "pageassessments")
                return articleResult("Example", {});
            return talkResult("{{WPBS|class=A}}\n{{多個專題|class=D}}");
        }),
        "",
    );
    assert.equal(
        await lookupAssessment("Example", async () => {
            throw new Error("Unavailable");
        }),
        "",
    );
});

test("a missing article cannot inherit a rating from a leftover talk page", async () => {
    let calls = 0;
    assert.equal(
        await lookupAssessment("Deleted", async () => {
            calls++;
            return {
                query: { pages: [{ ns: 0, title: "Deleted", missing: true }] },
            };
        }),
        "",
    );
    assert.equal(calls, 1);
});

test("an article alias redirected to a non-article cannot inherit a talk rating", async () => {
    let calls = 0;
    assert.equal(
        await lookupAssessment("Moved", async () => {
            calls++;
            return { query: { pages: [{ ns: 4, title: "Wikipedia:Moved" }] } };
        }),
        "",
    );
    assert.equal(calls, 1);
});

test("review context uses explicit local process or quality headings", () => {
    const cases = [
        ["Talk:地球冒险3", "润色意见", "ce"],
        ["Talk:示例", "潤飾意見", "ce"],
        ["Talk:Example", "Copy_editing_comments", "ce"],
        ["Wikipedia:同行评审/提案区/示例", "意见", "pr"],
        ["維基百科:同行評審/提案區", "", "pr"],
        ["Wikipedia:Peer_review/Example/archive1", "", "pr"],
        ["Talk:BanG Dream! 少女樂團派對", "#甲級條目評審", "a-rev"],
        ["Talk:示例", encodeURIComponent("乙上级评审_2"), "bplus-rev"],
        ["Talk:示例", "優良條目評選", "ga-rev"],
        ["Wikipedia:特色列表評選/提名區", "", "fl-rev"],
        ["Talk:Example", "Featured article review", "fa-rev"],
        ["Talk:示例", "意见", ""],
        ["Talk:示例", "重新评级", ""],
        ["Talk:Example", "A review", ""],
        ["Talk:Example", "About peer review", ""],
    ];
    for (const [title, fragment, expected] of cases) {
        assert.equal(
            assessmentFromReviewLink(title, fragment),
            expected,
            `${title}#${fragment}`,
        );
    }
});
