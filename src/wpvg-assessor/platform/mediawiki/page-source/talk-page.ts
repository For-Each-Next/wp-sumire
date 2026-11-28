/**
 * @file src/wpvg-assessor/platform/mediawiki/page-source/talk-page.ts
 * Purpose: Reads talk-page snapshots and writes reviewed talk-page edits.
 *
 * Contents: Snapshot decoding and create-only or timestamp-protected edits.
 */

import type { Logger } from "../../../support/logging/logger.ts";
import {
    type ApiRecord,
    readFirstRevision,
} from "@for-each-next/wp/mediawiki";
import type { PageSnapshot, PreparedTalkEdit } from "../../../domain/types.ts";
import {
    type ApiParameters,
    createLoggedApiRequests,
} from "../api-requests.ts";
import {
    createPageSourceParams,
    readPageSourceQuery,
    readRevisionSource,
} from "./query.ts";

export interface TalkPageApi {
    fetchTalkPage(api: mw.Api, title: string): Promise<PageSnapshot>;
    postTalkPageEdit(
        api: mw.Api,
        page: PageSnapshot,
        edit: PreparedTalkEdit,
        text: string,
        attempt: number,
    ): Promise<void>;
}

/** Creates the talk-page adapter with scoped diagnostics. */
export function createTalkPageApi(logger: Logger): TalkPageApi {
    const requests = createLoggedApiRequests(logger.child("request"));

    async function fetchTalkPage(
        api: mw.Api,
        title: string,
    ): Promise<PageSnapshot> {
        logger.debug("page-text.fetch.started", { title });
        const response = await requests.get(
            api,
            "page-text.fetch",
            createPageSourceParams(title, "content|timestamp"),
        );
        const { pages, starttimestamp } = readPageSourceQuery(response);
        const result = decodeTalkPageSnapshot(pages[0], starttimestamp);
        logger.info("page-text.fetch.completed", {
            exists: result.exists,
            characterCount: result.text.length,
            title,
        });
        return result;
    }

    async function postTalkPageEdit(
        api: mw.Api,
        page: PageSnapshot,
        edit: PreparedTalkEdit,
        text: string,
        attempt: number,
    ): Promise<void> {
        const params = createTalkEditParams(page, edit, text);
        await requests.postWithToken(api, "talk-page.save", "csrf", params);
        logger.info("talk-page.save.completed", {
            attempt,
            title: edit.title,
        });
    }
    return Object.freeze({ fetchTalkPage, postTalkPageEdit });
}

/** Decodes a talk page from a standalone or combined revision query. */
export function decodeTalkPageSnapshot(
    page: ApiRecord | undefined,
    starttimestamp: string,
): PageSnapshot {
    if (page == null || page.invalid != null) {
        throw new Error("MediaWiki response omitted the requested talk page.");
    }
    if (page.missing === true) {
        return { exists: false, starttimestamp, text: "" };
    }
    return {
        ...readRevisionSource(readFirstRevision(page)),
        exists: true,
        starttimestamp,
    };
}

function createTalkEditParams(
    page: PageSnapshot,
    edit: PreparedTalkEdit,
    text: string,
): ApiParameters {
    const params: ApiParameters = {
        action: "edit",
        starttimestamp: page.starttimestamp,
        summary: edit.summary,
        text,
        title: edit.title,
    };

    if (page.basetimestamp != null) {
        params.basetimestamp = page.basetimestamp;
    }
    if (!page.exists) {
        params.createonly = true;
    }
    return params;
}
