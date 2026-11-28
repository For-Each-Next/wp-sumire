/**
 * @file src/wpvg-assessor/platform/browser/creation-time-cache.ts
 * Purpose: Stores disposable page-creation timestamps in browser local storage.
 *
 * Contents: Disposable timestamp storage and title normalization.
 */

import type { Logger } from "../../support/logging/logger.ts";
import { CREATION_CACHE_KEY } from "./local-storage.ts";

const MAX_CACHE_ENTRIES = 2048;

export type CreationTimeCache = Record<string, string>;

export interface CreationTimeCacheStore {
    read(): CreationTimeCache;
    write(cache: CreationTimeCache): void;
}

/** Creates the browser cache adapter with scoped diagnostics. */
export function createCreationTimeCacheStore(
    logger: Logger,
): CreationTimeCacheStore {
    function read(): CreationTimeCache {
        try {
            const raw = globalThis.localStorage?.getItem(CREATION_CACHE_KEY);
            if (!raw) {
                return {};
            }
            const parsed: unknown = JSON.parse(raw);
            return isCreationTimeCache(parsed) ? parsed : {};
        } catch (error) {
            logger.warn("creation-time-cache.read.failed", { error });
            return {};
        }
    }

    function write(cache: CreationTimeCache): void {
        try {
            const storage = globalThis.localStorage;
            const entries = Object.entries(cache).slice(-MAX_CACHE_ENTRIES);
            if (storage != null) {
                storage.setItem(
                    CREATION_CACHE_KEY,
                    JSON.stringify(Object.fromEntries(entries)),
                );
            }
            logger.debug("creation-time-cache.write.completed", {
                size: entries.length,
            });
        } catch (error) {
            logger.warn("creation-time-cache.write.failed", { error });
        }
    }

    return Object.freeze({ read, write });
}

export function normalizeCreationTimeCacheTitle(title: string): string {
    return String(title || "")
        .replace(/_/gu, " ")
        .trim();
}

function isCreationTimeCache(value: unknown): value is CreationTimeCache {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((entry) => typeof entry === "string");
}
