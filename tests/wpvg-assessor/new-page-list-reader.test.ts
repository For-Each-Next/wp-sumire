/**
 * @file tests/wpvg-assessor/new-page-list-reader.test.ts
 * Purpose: Checks log read reuse, expiry, and invalidation.
 * Contents: Offline log and talk page requests.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { createNewPageListReader } from "../../src/wpvg-assessor/app/new-page-list-reader.ts";
import type {
    AssessmentPageSnapshots,
    NewPageListSnapshot,
} from "../../src/wpvg-assessor/domain/types.ts";

const api = {} as mw.Api;
const timestamp = "2026-10-01T01:00:00Z";
const savedLog: NewPageListSnapshot = {
    revisionId: 600,
    basetimestamp: timestamp,
    starttimestamp: timestamp,
    text: "Existing log",
};
const talkPage = { exists: false, starttimestamp: timestamp, text: "" };

test("a recent tab snapshot serves a talk-only load and refreshes after one minute", async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now: new Date(timestamp) });
    const freshLog = { ...savedLog, revisionId: 601, text: "Fresh log" };
    let tabReads = 0;
    let listReads = 0;
    const reader = createNewPageListReader({
        readTabSnapshot() {
            tabReads += 1;
            return savedLog;
        },
        async fetchAssessmentPages() {
            assert.fail("A recent tab snapshot avoids a combined read.");
        },
        async fetchTalkPage() {
            return talkPage;
        },
        async fetchNewPageList() {
            listReads += 1;
            return freshLog;
        },
    });
    assert.deepEqual(await reader.fetchAssessmentPages(api, "Talk:Example"), {
        newPageList: savedLog,
        talkPage,
    });
    t.mock.timers.tick(59_999);
    assert.equal(await reader.fetchNewPageList(api), savedLog);
    assert.equal(listReads, 0);
    t.mock.timers.tick(1);
    assert.equal(await reader.fetchNewPageList(api), freshLog);
    assert.equal(await reader.fetchNewPageList(api), freshLog);
    assert.equal(listReads, 1);
    assert.equal(tabReads, 1);
});

test("concurrent loads share pending log content and invalidation drops late or failed reads", async () => {
    const combined = Promise.withResolvers<AssessmentPageSnapshots>();
    const freshLog = { ...savedLog, revisionId: 601, text: "After save" };
    let listReads = 0;
    const reader = createNewPageListReader({
        readTabSnapshot: () => null,
        fetchAssessmentPages: () => combined.promise,
        async fetchTalkPage() {
            return talkPage;
        },
        async fetchNewPageList() {
            listReads += 1;
            if (listReads === 1) throw new Error("Temporary read failure");
            return freshLog;
        },
    });
    const opening = reader.fetchAssessmentPages(api, "Talk:Example");
    const shared = reader.fetchNewPageList(api);
    assert.equal(listReads, 0);
    reader.invalidate();
    await assert.rejects(
        reader.fetchNewPageList(api),
        /Temporary read failure/u,
    );
    assert.equal(await reader.fetchNewPageList(api), freshLog);
    combined.resolve({ talkPage, newPageList: savedLog });
    assert.equal((await opening).newPageList, savedLog);
    assert.equal(await shared, savedLog);
    assert.equal(await reader.fetchNewPageList(api), freshLog);
    assert.equal(listReads, 2);
});
