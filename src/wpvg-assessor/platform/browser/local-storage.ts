/**
 * @file src/wpvg-assessor/platform/browser/local-storage.ts
 * Purpose: Owns persistent assessment keys and quota recovery.
 * Contents: Queue persistence and explicit scoped deletion.
 */

export const QUEUE_PREFIX = "sumire.wpvg-assessor.assessment-queue.v1:";
export const EDIT_TIME_PREFIX = "sumire.wpvg-assessor.next-edit.v1:";
export const CREATION_CACHE_KEY = "sumire.wpvg-assessor.creation-datetimes.v1";

/** Retry a full queue write after freeing the tool's disposable creation dates. */
export function writeAssessmentQueue(
    storage: Storage,
    key: string,
    source: string,
): void {
    try {
        storage.setItem(key, source);
    } catch (error) {
        if (
            !(error instanceof DOMException) ||
            error.name !== "QuotaExceededError" ||
            storage.getItem(CREATION_CACHE_KEY) === null
        )
            throw error;
        storage.removeItem(CREATION_CACHE_KEY);
        storage.setItem(key, source);
    }
}

/** Removes only Article Assessor records from the current origin's local storage. */
export async function clearAssessmentLocalStorage(
    identity: string,
): Promise<number> {
    const storage = globalThis.localStorage;
    const identities = new Set([encodeURIComponent(identity)]);
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(QUEUE_PREFIX))
            identities.add(key.slice(QUEUE_PREFIX.length));
        else if (key?.startsWith(EDIT_TIME_PREFIX))
            identities.add(key.slice(EDIT_TIME_PREFIX.length));
    }

    let removed = 0;
    function remove(key: string): void {
        if (storage.getItem(key) === null) return;
        storage.removeItem(key);
        removed += 1;
    }

    const locks = globalThis.navigator?.locks;
    for (const scope of identities) {
        const queueKey = `${QUEUE_PREFIX}${scope}`;
        const clearQueue = () => {
            remove(queueKey);
            remove(`${EDIT_TIME_PREFIX}${scope}`);
        };
        if (locks == null) clearQueue();
        else await locks.request(queueKey, clearQueue);
    }
    remove(CREATION_CACHE_KEY);
    return removed;
}
