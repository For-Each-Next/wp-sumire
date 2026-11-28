/**
 * @file tests/wpvg-assessor/dialog-state.test.ts
 * Purpose: Characterizes fully prepared initial dialog state.
 *
 * Table of contents:
 * 1. Imports
 * 2. Test scenarios
 * 3. createAdapters
 * 4. createAssessmentPages
 */

import assert from "node:assert/strict";
import test from "node:test";

import projectConfig from "../../src/wpvg-assessor/domain/project-config.ts";
import { createDialogStateLoader } from "../../src/wpvg-assessor/app/dialog-state.ts";

test("prepares registration before returning dialog state", async () => {
    const requestedCreationTitles: Array<string> = [];
    const loadDialogState = createDialogStateLoader(
        createAdapters(requestedCreationTitles),
        projectConfig,
    );
    const state = await loadDialogState({} as mw.Api, {} as mw.Title);

    assert.deepEqual(requestedCreationTitles, ["Example"]);
    assert.equal(state.newPageList.text.includes("2026年"), true);
    assert.equal(state.registration.changed, true);
    assert.equal(state.registration.eligible, true);
    assert.match(
        state.registration.proposedText,
        /\{\{vgc\|Example\}\}\{\{Dykico\}\}/u,
    );
    assert.equal("registrationLoading" in state, false);
});

test("loads COCORO without ordering reads when already registered", async () => {
    const adapters = createAdapters([]);
    const pages = createAssessmentPages();
    const lead = [
        "{{DYKtalk|date=2026-09-27}}",
        "{{WikiProject banner shell|class=Unassessed|1=",
        "{{WikiProject Video games|importance=Low}}",
        "}}",
    ].join("\n");
    pages.talkPage.text = `${lead}\n\n== 其他 ==\nDiscussion and DYK archive.`;
    pages.newPageList.text = [
        "== 2026年 ==",
        "* 8月29日 - {{vgc|COCORO (遊戲)}}、{{vgc|COCORO}}、{{vgc|File:阴阳师 (游戏).JPG}}",
        "",
    ].join("\n");
    adapters.fetchAssessmentPages = async () => pages;
    adapters.fetchSubjectPageInfo = async () => ({
        creationDate: new Date("2026-08-29T08:14:32Z"),
        isRedirect: false,
        listedTitle: "COCORO",
        namespaceNumber: 0,
        targetTitle: "COCORO",
    });
    adapters.getSubjectPageTitle = () => "COCORO";
    adapters.getTalkPageTitle = () => "Talk:COCORO";
    adapters.fetchPageCreationTimes = async () => {
        assert.fail("An unchanged registration needs no ordering reads.");
    };
    const loadDialogState = createDialogStateLoader(adapters, projectConfig);
    const state = await loadDialogState({} as mw.Api, {} as mw.Title);

    assert.equal(state.subjectTitle, "COCORO");
    assert.equal(state.talkTitle, "Talk:COCORO");
    assert.equal(state.assessment.className, "Unassessed");
    assert.equal(state.assessment.importance, "Low");
    assert.equal(state.page.text, pages.talkPage.text);
    assert.equal(state.registration.alreadyRegistered, true);
    assert.equal(state.registration.proposedText, pages.newPageList.text);
    assert.equal(
        state.creationTimes.get("COCORO")?.toISOString(),
        "2026-08-29T08:14:32.000Z",
    );
});

test("skips ordering reads for an article older than the retained list", async () => {
    const adapters = createAdapters([]);
    const readSubjectInfo = adapters.fetchSubjectPageInfo;
    adapters.fetchSubjectPageInfo = async (api, title) => ({
        ...(await readSubjectInfo(api, title)),
        creationDate: new Date("2025-01-01T00:00:00Z"),
    });
    adapters.fetchPageCreationTimes = async () => {
        assert.fail("An ineligible registration needs no ordering reads.");
    };
    const loadDialogState = createDialogStateLoader(adapters, projectConfig);
    const state = await loadDialogState({} as mw.Api, {} as mw.Title);

    assert.equal(state.registration.eligible, false);
    assert.equal(state.registration.changed, false);
});

function createAdapters(
    requestedCreationTitles: Array<string>,
): Parameters<typeof createDialogStateLoader>[0] {
    return {
        async fetchAssessmentPages() {
            return createAssessmentPages();
        },
        async fetchPageCreationTimes(_api, titles) {
            requestedCreationTitles.push(...titles);
            return new Map();
        },
        async fetchSubjectPageInfo() {
            return {
                creationDate: new Date("2026-04-07T00:00:00Z"),
                isRedirect: false,
                listedTitle: "Example",
                namespaceNumber: 0,
                targetTitle: "Example",
            };
        },
        getSubjectPageTitle() {
            return "Example";
        },
        getTalkPageTitle() {
            return "Talk:Example";
        },
    };
}

function createAssessmentPages() {
    return {
        newPageList: {
            basetimestamp: "log-base",
            revisionId: 123,
            starttimestamp: "query-time",
            text: "== 2026年 ==\n* 4月1日 - {{vgc|Old}}\n",
        },
        talkPage: {
            basetimestamp: "talk-base",
            exists: true,
            starttimestamp: "query-time",
            text: [
                "{{DYK Invite}}",
                "{{WikiProject Video games|importance=Low}}",
            ].join("\n"),
        },
    };
}
