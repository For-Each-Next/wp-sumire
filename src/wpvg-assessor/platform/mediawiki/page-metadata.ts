/**
 * @file src/wpvg-assessor/platform/mediawiki/page-metadata.ts
 * Purpose: Reads subject metadata and cached creation timestamps.
 *
 * Contents: Current-page metadata, creation-time caching, and namespace batching.
 */

import type { Logger } from "../../support/logging/logger.ts";
import {
    type ApiRecord,
    readActionQuery,
    readFirstRevision,
    readQueryPages,
} from "@for-each-next/wp/mediawiki";
import { getTitleNamespaceId } from "../../support/wiki-titles/wikipedia.ts";
import type { SubjectPageInfo } from "../../domain/types.ts";
import {
    type CreationTimeCache,
    type CreationTimeCacheStore,
    normalizeCreationTimeCacheTitle,
} from "../browser/creation-time-cache.ts";
import {
    createLoggedApiRequests,
    type LoggedApiRequests,
} from "./api-requests.ts";
import { getRequiredString, getRevisionContent } from "./response.ts";

const MAX_TITLES_PER_QUERY = 50;

interface PageMetadataContext {
    cache: CreationTimeCacheStore;
    logger: Logger;
    requests: LoggedApiRequests;
}

export interface PageMetadataApi {
    fetchPageCreationTimes(
        api: mw.Api,
        titles: string[],
    ): Promise<Map<string, Date>>;
    fetchSubjectPageInfo(api: mw.Api, title: string): Promise<SubjectPageInfo>;
}

/**
 * Creates metadata readers with injected cache and diagnostics.
 */
export function createPageMetadataApi(
    logger: Logger,
    cache: CreationTimeCacheStore,
): PageMetadataApi {
    const context: PageMetadataContext = {
        cache,
        logger,
        requests: createLoggedApiRequests(logger.child("request")),
    };
    return Object.freeze({
        fetchPageCreationTimes: fetchPageCreationTimes.bind(null, context),
        fetchSubjectPageInfo: fetchSubjectPageInfo.bind(null, context),
    });
}

/**
 * Fetches the assessed page's own creation metadata without following redirects.
 *
 * @param api - MediaWiki API client.
 * @param title - Subject-page title.
 * @returns Page metadata.
 */
async function fetchSubjectPageInfo(
    context: PageMetadataContext,
    api: mw.Api,
    title: string,
): Promise<SubjectPageInfo> {
    context.logger.debug("subject-page.fetch.started", { title });
    const page = await fetchCurrentPage(context, api, title);
    if (page == null) {
        throw new Error(`Unable to read the current subject page: ${title}.`);
    }
    const targetTitle = getRequiredString(page, "title", "the subject title");
    const creationTimes = await fetchRevisionCreationTimes(context, api, [
        targetTitle,
    ]);
    const creationDate = creationTimes.get(targetTitle);

    if (creationDate == null) {
        throw new Error(`Unable to read the creation date for ${title}.`);
    }

    const result = {
        creationDate,
        isRedirect: page.redirect === true,
        listedTitle: title,
        namespaceNumber: readPageNamespace(page, title),
        targetTitle,
    };

    const creationTimestamp = result.creationDate.toISOString();
    context.logger.info("subject-page.fetch.completed", {
        ...result,
        creationDate: creationTimestamp,
    });

    return result;
}

function readPageNamespace(
    page: Record<string, unknown> | null,
    title: string,
): number {
    if (typeof page?.ns !== "number") {
        throw new Error(`Unable to read the namespace for ${title}.`);
    }

    return page.ns;
}

/**
 * Fetches each listed page's own creation time, including redirect pages.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation times by listed title.
 */
async function fetchPageCreationTimes(
    context: PageMetadataContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    context.logger.debug("creation-times.fetch.started", { titles });
    const uniqueTitles = [...new Set(titles.filter(Boolean))];
    const creationTimes = new Map<string, Date>();

    if (uniqueTitles.length === 0) {
        context.logger.debug("creation-times.fetch.skipped");
        return creationTimes;
    }

    const canonicalTitles = await readCanonicalTitles(
        context,
        api,
        uniqueTitles,
    );
    const targets = [...new Set(canonicalTitles.values())];
    const targetCreationTimes = await fetchRevisionCreationTimes(
        context,
        api,
        targets,
    );

    mergeCanonicalCreationTimes(
        creationTimes,
        canonicalTitles,
        targetCreationTimes,
    );

    context.logger.info("creation-times.fetch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Reads canonical titles without following redirects.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Canonical titles for readable requested pages.
 */
async function readCanonicalTitles(
    context: PageMetadataContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, string>> {
    const canonicalTitles = new Map<string, string>();
    const readTitle = readCanonicalTitle.bind(
        null,
        context,
        api,
        canonicalTitles,
    );
    const requests = titles.map(readTitle);

    await Promise.all(requests);

    return canonicalTitles;
}

/**
 * Reads and stores one canonical title without following redirects.
 *
 * @param api - MediaWiki API client.
 * @param canonicalTitles - Mutable canonical-title map.
 * @param title - Source title.
 */
async function readCanonicalTitle(
    context: PageMetadataContext,
    api: mw.Api,
    canonicalTitles: Map<string, string>,
    title: string,
): Promise<void> {
    const page = await fetchCurrentPage(context, api, title);
    if (page == null) {
        context.logger.debug("creation-times.title.missing");
        return;
    }
    const canonicalTitle = getRequiredString(page, "title", "the page title");
    canonicalTitles.set(title, canonicalTitle);
}

/**
 * Maps canonical creation times back to requested titles.
 *
 * @param canonicalTitles - Canonical titles value.
 */
function mergeCanonicalCreationTimes(
    output: Map<string, Date>,
    canonicalTitles: Map<string, string>,
    targetTimes: Map<string, Date>,
): void {
    for (const [title, target] of canonicalTitles) {
        const date = targetTimes.get(target);

        if (date != null) {
            output.set(title, date);
            output.set(target, date);
        }
    }
}

/**
 * Reads the current page's own metadata and validates readable source.
 *
 * @param api - MediaWiki API client.
 * @param title - Page title.
 * @returns Current page metadata, or null for an explicitly missing page.
 */
async function fetchCurrentPage(
    context: PageMetadataContext,
    api: mw.Api,
    title: string,
): Promise<ApiRecord | null> {
    context.logger.debug("current-page-text.fetch.started", { title });
    const response = await context.requests.get(
        api,
        "current-page-text.fetch",
        {
            action: "query",
            formatversion: "2",
            prop: "info|revisions",
            rvprop: "content",
            rvslots: "main",
            titles: title,
        },
    );
    const page = readQueryPages(readActionQuery(response))?.[0] ?? null;
    if (page?.missing != null) {
        context.logger.debug("current-page-text.fetch.completed", {
            exists: false,
            title,
        });
        return null;
    }
    const revision = readFirstRevision(page);
    const text = getRevisionContent(revision);

    context.logger.debug("current-page-text.fetch.completed", {
        characterCount: text.length,
        title,
    });

    return page;
}

/**
 * Fetches each canonical page's own first-revision timestamp.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimes(
    context: PageMetadataContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    context.logger.debug("revision-creation-times.fetch.started", { titles });
    const creationTimes = new Map<string, Date>();
    const uniqueTitles = [...new Set(titles.filter(Boolean))];
    const cache = context.cache.read();
    const uncachedTitles = readCachedCreationTimes(
        context,
        uniqueTitles,
        cache,
        creationTimes,
    );

    await fetchUncachedCreationTimes(
        context,
        api,
        uncachedTitles,
        cache,
        creationTimes,
    );

    context.cache.write(cache);
    context.logger.info("revision-creation-times.fetch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Returns titles without cached creation times.
 *
 * @param titles - Page titles.
 * @param cache - Cached values.
 */
function readCachedCreationTimes(
    context: PageMetadataContext,
    titles: string[],
    cache: CreationTimeCache,
    creationTimes: Map<string, Date>,
): Array<string> {
    const result = [];

    for (const title of titles) {
        const cacheTitle = normalizeCreationTimeCacheTitle(title);
        const cached = cache[cacheTitle];

        if (cached == null) {
            result.push(title);
        } else {
            const creationDate = new Date(cached);
            creationTimes.set(title, creationDate);
            context.logger.debug("revision-creation-times.cache.hit", {
                timestamp: cached,
                title,
            });
        }
    }

    return result;
}

/**
 * Fetches uncached creation times in namespace-homogeneous batches.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @param cache - Cached values.
 */
async function fetchUncachedCreationTimes(
    context: PageMetadataContext,
    api: mw.Api,
    titles: string[],
    cache: CreationTimeCache,
    output: Map<string, Date>,
) {
    for (const group of groupTitlesByNamespace(titles).values()) {
        for (
            let index = 0;
            index < group.length;
            index += MAX_TITLES_PER_QUERY
        ) {
            const batch = group.slice(index, index + MAX_TITLES_PER_QUERY);
            const times = await fetchRevisionCreationTimeBatch(
                context,
                api,
                batch,
            );

            mergeCreationTimeBatch(output, cache, batch, times);
        }
    }
}

/**
 * Merges one API batch into creation-time output and cache maps.
 *
 * @param cache - Cached values.
 * @param titles - Page titles.
 */
function mergeCreationTimeBatch(
    output: Map<string, Date>,
    cache: CreationTimeCache,
    titles: string[],
    times: Map<string, Date>,
): void {
    for (const [title, date] of times) {
        output.set(title, date);
        const cacheTitle = normalizeCreationTimeCacheTitle(title);
        cache[cacheTitle] = date.toISOString();
    }

    for (const title of titles) {
        const date = getCreationTimeForTitle(times, title);

        if (date != null) {
            output.set(title, date);
            const cacheTitle = normalizeCreationTimeCacheTitle(title);
            cache[cacheTitle] = date.toISOString();
        }
    }
}

/**
 * Fetches creation timestamps for one namespace-homogeneous title
 * batch.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimeBatch(
    context: PageMetadataContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    try {
        return await fetchRevisionCreationTimeBatchUnsafe(
            context,
            api,
            titles,
        );
    } catch (error) {
        if (titles.length <= 1) {
            throw error;
        }

        return await fetchIndividualCreationTimes(context, api, titles, error);
    }
}

/**
 * Retries a failed creation-time batch one title at a time.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @param error - Caught error.
 */
async function fetchIndividualCreationTimes(
    context: PageMetadataContext,
    api: mw.Api,
    titles: string[],
    error: unknown,
): Promise<Map<string, Date>> {
    const creationTimes = new Map<string, Date>();

    context.logger.warn("revision-creation-times.batch.fallback", {
        error,
        titles,
    });
    for (const title of titles) {
        const single = await fetchRevisionCreationTimeBatchUnsafe(
            context,
            api,
            [title],
        );

        for (const [singleTitle, date] of single) {
            creationTimes.set(singleTitle, date);
        }
    }

    return creationTimes;
}

/**
 * Fetches creation timestamps without fallback.
 *
 * @param api - MediaWiki API client.
 * @param titles - Page titles.
 * @returns Creation timestamps.
 */
async function fetchRevisionCreationTimeBatchUnsafe(
    context: PageMetadataContext,
    api: mw.Api,
    titles: Array<string>,
): Promise<Map<string, Date>> {
    const namespaceGroup = getNamespaceGroupKey(titles[0]);
    context.logger.debug("revision-creation-times.batch.started", {
        namespaceGroup,
        titles,
    });
    const joinedTitles = titles.join("|");
    const response = await context.requests.get(
        api,
        "revision-creation-times.fetch",
        {
            action: "query",
            formatversion: "2",
            prop: "revisions",
            rvdir: "newer",
            rvlimit: 1,
            rvprop: "timestamp",
            titles: joinedTitles,
        },
    );
    const creationTimes = parseRevisionCreationTimes(response);
    context.logger.debug("revision-creation-times.batch.completed", {
        itemCount: creationTimes.size,
    });

    return creationTimes;
}

/**
 * Parses first-revision timestamps from a query response.
 *
 * @param response - Fetch response.
 * @returns First-revision timestamps from a query response.
 */
function parseRevisionCreationTimes(response: unknown): Map<string, Date> {
    const creationTimes = new Map<string, Date>();

    for (const page of readQueryPages(readActionQuery(response)) ?? []) {
        const revision = readFirstRevision(page);
        const timestamp = revision?.timestamp;

        if (typeof timestamp === "string" && typeof page.title === "string") {
            const creationDate = new Date(timestamp);
            creationTimes.set(page.title, creationDate);
        }
    }

    return creationTimes;
}

/**
 * Groups titles by namespace prefix to avoid mixed-namespace revision
 * batches.
 *
 * @param titles - Page titles.
 * @returns Titles by namespace group.
 */
function groupTitlesByNamespace(
    titles: Array<string>,
): Map<string, Array<string>> {
    const groups = new Map<string, Array<string>>();

    for (const title of titles) {
        const key = getNamespaceGroupKey(title);

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key)?.push(title);
    }

    return groups;
}

/**
 * Gets a conservative namespace group key from a title.
 *
 * @param title - Page title.
 * @returns Namespace key.
 */
function getNamespaceGroupKey(title: string): string {
    const namespaceId = getTitleNamespaceId(String(title || ""));
    return namespaceId === 0 ? "" : String(namespaceId);
}

/**
 * Gets a creation time from a map using title normalization.
 *
 * @param creationTimes - Creation times.
 * @param title - Requested title.
 * @returns Creation datetime.
 */
function getCreationTimeForTitle(
    creationTimes: Map<string, Date>,
    title: string,
): Date | null {
    if (creationTimes.has(title)) {
        return creationTimes.get(title) ?? null;
    }

    const normalized = normalizeCreationTimeCacheTitle(title);
    for (const [entryTitle, date] of creationTimes) {
        if (normalizeCreationTimeCacheTitle(entryTitle) === normalized)
            return date;
    }
    return null;
}
