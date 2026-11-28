/**
 * @file src/wpvg-assessor/platform/mediawiki/response.ts
 * Purpose: Decodes the small MediaWiki response shapes used by the gadget.
 *
 * Contents: Required string fields and main-slot source.
 */

import { readRecord, type ApiRecord } from "@for-each-next/wp/mediawiki";

export function getRevisionContent(revision: ApiRecord | null): string {
    const slots = readRecord(revision?.slots);
    const main = readRecord(slots?.main);
    const content = main?.content;
    if (typeof content !== "string") {
        throw new Error(
            "MediaWiki response omitted readable revision content.",
        );
    }
    return content;
}

export function getRequiredString(
    record: ApiRecord | null,
    key: string,
    description: string,
): string {
    const value = record?.[key];
    if (typeof value !== "string" || value === "") {
        throw new Error(`MediaWiki response omitted ${description}.`);
    }

    return value;
}
