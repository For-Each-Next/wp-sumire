import {
    httpUrl,
    normalizeHost,
    type SourceRecord,
    type SourceStatus,
} from "./source-table.ts";

interface SourceIndex {
    sources: Map<string, SourceRecord[]>;
    names: Map<string, Set<string>>;
    scopedNames: Map<string, Set<string>>;
    hosts: Map<string, { sourceKey: string; path: string }[]>;
}

export interface SourceMatch {
    status: SourceStatus | "unknown";
    matchedBy: "name" | "domain" | "name+domain" | null;
    records: SourceRecord[];
    conflict: boolean;
    scopeMismatch: boolean;
    requiresReview: boolean;
}

function normalizedName(value: string): string {
    return value
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

export function buildSourceIndex(records: SourceRecord[]): SourceIndex {
    const sources: SourceIndex["sources"] = new Map();
    const names: SourceIndex["names"] = new Map();
    const scopedNames: SourceIndex["scopedNames"] = new Map();
    const hosts: SourceIndex["hosts"] = new Map();
    function addNames(
        target: Map<string, Set<string>>,
        aliases: string[],
        sourceKey: string,
    ): void {
        for (const alias of aliases) {
            const key = normalizedName(alias);
            if (!key) continue;
            const matches = target.get(key) ?? new Set();
            matches.add(sourceKey);
            target.set(key, matches);
        }
    }

    for (const record of records) {
        const rows = sources.get(record.sourceKey) ?? [];
        rows.push(record);
        sources.set(record.sourceKey, rows);
        addNames(names, record.aliases, record.sourceKey);
        if (record.scopedAliases)
            addNames(scopedNames, record.scopedAliases, record.sourceKey);
        for (const { host, path } of record.urlRules) {
            const matches = hosts.get(host) ?? [];
            matches.push({ sourceKey: record.sourceKey, path });
            hosts.set(host, matches);
        }
    }
    return { sources, names, scopedNames, hosts };
}

function matchUrl(
    index: SourceIndex,
    { hostname, pathname }: URL,
): Set<string> {
    const matches = new Set<string>();
    let longest = 0;
    for (const { sourceKey, path } of index.hosts.get(
        normalizeHost(hostname),
    ) ?? []) {
        if (
            path !== "/" &&
            pathname !== path &&
            !pathname.startsWith(path + "/")
        )
            continue;
        if (path.length < longest) continue;
        if (path.length > longest) matches.clear();
        longest = path.length;
        matches.add(sourceKey);
    }
    return matches;
}

export function matchSource(
    index: SourceIndex,
    { name, urls }: { name: string; urls: string[] },
): SourceMatch {
    const usableUrls = urls
        .map((url) => httpUrl(url))
        .filter((url) => url !== null);
    const key = normalizedName(name);
    const named = new Set(index.names.get(key));
    // A regional row's short anchor can corroborate an original link.
    if (usableUrls.length) {
        for (const scoped of index.scopedNames.get(key) ?? [])
            named.add(scoped);
    }
    const urlMatches = usableUrls
        .map((url) => matchUrl(index, url))
        .filter((keys) => keys.size);
    const domains = new Set(urlMatches.flatMap((keys) => [...keys]));
    const result: SourceMatch = {
        matchedBy: null,
        records: [],
        status: "unknown",
        conflict: false,
        scopeMismatch: false,
        requiresReview: false,
    };
    const recordsFor = (keys: Iterable<string>) =>
        Array.from(keys).flatMap((key) => index.sources.get(key) ?? []);
    let keys = domains.size ? domains : named;
    let datedOverlap = false;

    if (named.size && domains.size) {
        result.matchedBy = "name+domain";
        const shared = [...named].filter((key) => domains.has(key));
        if (
            !shared.length ||
            urlMatches.some(
                (matches) => !shared.some((key) => matches.has(key)),
            )
        ) {
            return {
                ...result,
                conflict: true,
                records: recordsFor(new Set([...named, ...domains])),
            };
        }
        // A domain reused across periods can have different outlet names in the table.
        const domainRows = recordsFor(domains);
        datedOverlap =
            domains.size > shared.length &&
            domainRows.some((record) => record.temporal) &&
            new Set(domainRows.map((record) => record.status)).size > 1;
        if (!datedOverlap) keys = new Set(shared);
    } else if (domains.size) {
        result.matchedBy = "domain";
    } else if (named.size) {
        if (
            usableUrls.length &&
            recordsFor(named).some((record) => record.urlRules.length)
        ) {
            return { ...result, scopeMismatch: true };
        }
        result.matchedBy = "name";
    }

    if (!keys.size) return result;
    const records = recordsFor(keys);
    const statuses = new Set(records.map((record) => record.status));
    const conflict = keys.size > 1 && !datedOverlap;
    return {
        ...result,
        records,
        conflict,
        requiresReview:
            records.some((record) => record.temporal) || statuses.size > 1,
        status: conflict || statuses.size > 1 ? "unknown" : records[0].status,
    };
}
