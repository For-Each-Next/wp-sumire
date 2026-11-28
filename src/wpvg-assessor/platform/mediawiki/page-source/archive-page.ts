/**
 * @file src/wpvg-assessor/platform/mediawiki/page-source/archive-page.ts
 * Purpose: Read annual archive snapshots and make protected reviewed writes.
 *
 * Contents: Archive snapshot decoding and revision-protected writes.
 */

import {
    isPositiveSafeInteger,
    readFirstRevision,
} from "@for-each-next/wp/mediawiki";
import type { Logger } from "../../../support/logging/logger.ts";
import {
    getTitleNamespaceId,
    stripNamespacePrefix,
} from "../../../support/wiki-titles/wikipedia.ts";
import type { ArchivePageSnapshot } from "../../../app/archive-contracts.ts";
import { createLoggedApiRequests } from "../api-requests.ts";
import {
    createPageSourceParams,
    readPageSourceQuery,
    readRevisionSource,
} from "./query.ts";

export interface ArchivePageApi {
    fetchPageText(api: mw.Api, title: string): Promise<ArchivePageSnapshot>;
    saveArchivePage(
        api: mw.Api,
        snapshot: ArchivePageSnapshot,
        proposedText: string,
        summary: string,
    ): Promise<void>;
}

/** Binds generic page requests without changing the reviewed destination title. */
export function createArchivePageApi(logger: Logger): ArchivePageApi {
    const requests = createLoggedApiRequests(logger.child("request"));

    async function fetchPageText(
        api: mw.Api,
        title: string,
    ): Promise<ArchivePageSnapshot> {
        const response = await requests.get(
            api,
            "archive-page.fetch",
            createPageSourceParams(title),
        );
        return decodeArchivePageResponse(response, title);
    }

    async function saveArchivePage(
        api: mw.Api,
        snapshot: ArchivePageSnapshot,
        proposedText: string,
        summary: string,
    ): Promise<void> {
        if (snapshot.exists && !isPositiveSafeInteger(snapshot.revisionId)) {
            throw new Error("The archive snapshot omitted its revision ID.");
        }
        await requests.postWithToken(api, "archive-page.save", "csrf", {
            action: "edit",
            baserevid: snapshot.revisionId ?? undefined,
            createonly: !snapshot.exists ? true : undefined,
            nocreate: snapshot.exists ? true : undefined,
            starttimestamp: snapshot.starttimestamp,
            summary,
            text: proposedText,
            title: snapshot.title,
        });
    }

    return Object.freeze({ fetchPageText, saveArchivePage });
}

export function decodeArchivePageResponse(
    response: unknown,
    title: string,
): ArchivePageSnapshot {
    const {
        pages: [page],
        starttimestamp,
    } = readPageSourceQuery(response);
    if (
        page == null ||
        page.invalid != null ||
        !isSameArchiveTitle(title, page.title)
    ) {
        throw new Error(`Unable to read ${title}.`);
    }
    if (page.missing === true) {
        return {
            title,
            text: "",
            exists: false,
            revisionId: null,
            basetimestamp: null,
            starttimestamp,
        };
    }
    const revision = readFirstRevision(page);
    if (revision == null) {
        throw new Error(`Unable to read ${title}.`);
    }
    if (!isPositiveSafeInteger(revision.revid)) {
        throw new Error("The archive response omitted its revision ID.");
    }
    return {
        ...readRevisionSource(revision),
        title,
        exists: true,
        revisionId: revision.revid,
        starttimestamp,
    };
}

/** Accepts the API's canonical namespace name while retaining the exact page target. */
function isSameArchiveTitle(expected: string, actual: unknown): boolean {
    if (typeof actual !== "string") return false;
    const namespace = getTitleNamespaceId(expected);
    return (
        getTitleNamespaceId(actual) === namespace &&
        stripNamespacePrefix(actual, namespace).replace(/_/gu, " ") ===
            stripNamespacePrefix(expected, namespace).replace(/_/gu, " ")
    );
}
