/**
 * @file src/wpvg-assessor/app/new-page-list-reader.ts
 * Purpose: Reuses the WikiProject log across assessment reads and batch preparation.
 * Contents: Recent snapshots, concurrent reads, and write invalidation.
 */

import type {
    AssessmentPageSnapshots,
    NewPageListSnapshot,
    PageSnapshot,
} from "../domain/types.ts";

interface NewPageListReads {
    fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots>;
    fetchTalkPage(api: mw.Api, talkTitle: string): Promise<PageSnapshot>;
    fetchNewPageList(api: mw.Api): Promise<NewPageListSnapshot>;
    readTabSnapshot(): NewPageListSnapshot | null;
}

const MAX_AGE_MS = 60_000;

/** Reuses recent log content; writes still require the reviewed revision ID. */
export function createNewPageListReader(reads: NewPageListReads) {
    let latest:
        | { snapshot: NewPageListSnapshot; requestedAt: number }
        | null
        | undefined;
    let pending: Promise<NewPageListSnapshot> | null = null;

    function reuse(): Promise<NewPageListSnapshot> | null {
        if (pending != null) return pending;
        if (latest === undefined) {
            const cached = reads.readTabSnapshot();
            latest =
                cached?.revisionId === undefined
                    ? null
                    : {
                          snapshot: cached,
                          requestedAt: Date.parse(cached.starttimestamp),
                      };
        }
        return latest != null && isRecent(latest.requestedAt, Date.now())
            ? Promise.resolve(latest.snapshot)
            : null;
    }

    function track(
        read: Promise<NewPageListSnapshot>,
    ): Promise<NewPageListSnapshot> {
        const requestedAt = Date.now();
        const request = read
            .then((snapshot) => {
                if (pending === request && snapshot.revisionId !== undefined) {
                    latest = { snapshot, requestedAt };
                }
                return snapshot;
            })
            .finally(() => {
                if (pending === request) pending = null;
            });
        pending = request;
        return request;
    }

    async function fetchAssessmentPages(
        api: mw.Api,
        talkTitle: string,
    ): Promise<AssessmentPageSnapshots> {
        const reusable = reuse();
        if (reusable == null) {
            const combined = reads.fetchAssessmentPages(api, talkTitle);
            const [pages] = await Promise.all([
                combined,
                track(combined.then((pages) => pages.newPageList)),
            ]);
            return pages;
        }
        const [talkPage, newPageList] = await Promise.all([
            reads.fetchTalkPage(api, talkTitle),
            reusable,
        ]);
        return { talkPage, newPageList };
    }

    function fetchNewPageList(api: mw.Api): Promise<NewPageListSnapshot> {
        return reuse() ?? track(reads.fetchNewPageList(api));
    }

    function invalidate(): void {
        latest = null;
        pending = null;
    }

    return { fetchAssessmentPages, fetchNewPageList, invalidate };
}

function isRecent(observedAt: number, now: number): boolean {
    return observedAt <= now && now - observedAt < MAX_AGE_MS;
}
