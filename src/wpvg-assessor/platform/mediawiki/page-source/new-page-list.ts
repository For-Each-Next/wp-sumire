/**
 * @file src/wpvg-assessor/platform/mediawiki/page-source/new-page-list.ts
 * Purpose: Reads and writes the WikiProject Video games new-page list.
 *
 * Contents: New-page-list snapshots and revision-protected edits.
 */

import {
    isPositiveSafeInteger,
    type ApiRecord,
    readFirstRevision,
} from "@for-each-next/wp/mediawiki";
import type { Logger } from "../../../support/logging/logger.ts";
import { NEW_PAGE_LIST_TITLE } from "../../../domain/new-page-list.ts";
import type { NewPageListSnapshot } from "../../../domain/types.ts";
import { createLoggedApiRequests } from "../api-requests.ts";
import {
    createPageSourceParams,
    readPageSourceQuery,
    readRevisionSource,
} from "./query.ts";

export interface NewPageListApi {
    fetchNewPageList(api: mw.Api): Promise<NewPageListSnapshot>;
    savePreparedNewPageList(
        api: mw.Api,
        page: NewPageListSnapshot,
        proposedText: string,
        summary: string,
    ): Promise<void>;
}

/** Creates the new-page-list adapter with scoped diagnostics. */
export function createNewPageListApi(logger: Logger): NewPageListApi {
    const requests = createLoggedApiRequests(logger.child("request"));

    async function fetchNewPageList(
        api: mw.Api,
    ): Promise<NewPageListSnapshot> {
        logger.debug("new-page-list.fetch.started", {
            title: NEW_PAGE_LIST_TITLE,
        });
        const response = await requests.get(
            api,
            "new-page-list.fetch",
            createPageSourceParams(NEW_PAGE_LIST_TITLE),
        );
        const result = decodeNewPageListResponse(response);
        logger.info("new-page-list.fetch.completed", {
            characterCount: result.text.length,
            title: NEW_PAGE_LIST_TITLE,
        });
        return result;
    }

    async function savePreparedNewPageList(
        api: mw.Api,
        page: NewPageListSnapshot,
        proposedText: string,
        summary: string,
    ): Promise<void> {
        if (!isPositiveSafeInteger(page.revisionId)) {
            throw new Error(
                "The new-page-list snapshot omitted a valid revision ID. Reload the review before saving.",
            );
        }
        logger.info("new-page-list.save.started", {
            title: NEW_PAGE_LIST_TITLE,
        });
        await requests.postWithToken(api, "new-page-list.save", "csrf", {
            action: "edit",
            baserevid: page.revisionId,
            nocreate: true,
            starttimestamp: page.starttimestamp,
            summary,
            text: proposedText,
            title: NEW_PAGE_LIST_TITLE,
        });
        logger.info("new-page-list.save.completed", {
            title: NEW_PAGE_LIST_TITLE,
        });
    }

    return Object.freeze({ fetchNewPageList, savePreparedNewPageList });
}

export function decodeNewPageListResponse(
    response: unknown,
): NewPageListSnapshot {
    const { pages, starttimestamp } = readPageSourceQuery(response);
    return decodeNewPageListSnapshot(pages[0], starttimestamp);
}

/** Reads the log page from either a combined or a standalone API query. */
export function decodeNewPageListSnapshot(
    page: ApiRecord | undefined,
    starttimestamp: string,
): NewPageListSnapshot {
    if (page == null || page.missing != null || page.invalid != null) {
        throw new Error(`Unable to read ${NEW_PAGE_LIST_TITLE}.`);
    }
    const revision = readFirstRevision(page);
    if (revision == null) {
        throw new Error(`Unable to read ${NEW_PAGE_LIST_TITLE}.`);
    }

    const revisionId = revision.revid;
    if (!isPositiveSafeInteger(revisionId)) {
        throw new Error("MediaWiki response omitted a valid revision ID.");
    }

    return {
        ...readRevisionSource(revision),
        revisionId,
        starttimestamp,
    };
}
