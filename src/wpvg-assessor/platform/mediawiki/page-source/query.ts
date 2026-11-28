/**
 * @file src/wpvg-assessor/platform/mediawiki/page-source/query.ts
 * Purpose: Share the MediaWiki query and source fields for reviewed pages.
 * Contents: Revision query parameters and snapshot response decoding.
 */

import {
    readRecord,
    type ApiRecord,
    readActionQuery,
    readQueryPages,
} from "@for-each-next/wp/mediawiki";
import type { ApiParameters } from "../api-requests.ts";
import { getRequiredString, getRevisionContent } from "../response.ts";

interface PageSourceQuery {
    pages: readonly ApiRecord[];
    starttimestamp: string;
}

interface RevisionSource {
    basetimestamp: string;
    text: string;
}

/** Requests the latest main-slot source for pipe-delimited page titles. */
export function createPageSourceParams(
    titles: string,
    rvprop:
        | "ids|content|timestamp"
        | "content|timestamp" = "ids|content|timestamp",
): ApiParameters {
    return {
        action: "query",
        curtimestamp: true,
        formatversion: "2",
        prop: "revisions",
        rvprop,
        rvslots: "main",
        titles,
    };
}

/** Requires the query timestamp used as the start timestamp for edits. */
export function readPageSourceQuery(response: unknown): PageSourceQuery {
    const starttimestamp = getRequiredString(
        readRecord(response),
        "curtimestamp",
        "the query timestamp",
    );
    // Snapshot decoders report the missing page for their specific operation.
    const pages = readQueryPages(readActionQuery(response)) ?? [];
    return { pages, starttimestamp };
}

/** Requires a base timestamp and readable source. Empty source is valid. */
export function readRevisionSource(
    revision: ApiRecord | null,
): RevisionSource {
    return {
        basetimestamp: getRequiredString(
            revision,
            "timestamp",
            "the base timestamp",
        ),
        text: getRevisionContent(revision),
    };
}
