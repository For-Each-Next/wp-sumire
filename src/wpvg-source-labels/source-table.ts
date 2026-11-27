export const SOURCE_TITLE = "Wikipedia:WikiProject Video games/Sources";
export const SOURCE_URL =
    "https://en.wikipedia.org/wiki/Wikipedia:WikiProject_Video_games/Sources";
export const MAX_SOURCE_LENGTH = 8_000_000;

export type SourceStatus =
    "reliable" | "situational" | "unreliable" | "inconclusive";
const sections = new Map<string, SourceStatus>([
    ["reliable sources", "reliable"],
    ["situational sources", "situational"],
    ["unreliable sources", "unreliable"],
    ["inconclusive discussions", "inconclusive"],
]);
export const sourceStatuses: readonly SourceStatus[] = [...sections.values()];

interface UrlRule {
    host: string;
    path: string;
}

export interface SourceRecord {
    name: string;
    aliases: string[];
    scopedAliases?: string[];
    urlRules: UrlRule[];
    sourceKey: string;
    anchor: string;
    status: SourceStatus;
    section: string;
    subsection: string;
    dates: string;
    notes: string;
    contextNotes: string;
    discussions: string[];
    primary: boolean;
    temporal: boolean;
}

export interface SourceTable {
    records: SourceRecord[];
    sectionCounts: Record<SourceStatus, number>;
}

interface Context {
    level: number;
    title: string;
    anchor: string;
    notes: string[];
}

const ignored =
    "script,style,sup,.reference,.noprint,.mw-editsection,.module-shortcutanchordiv,.wp-rsp-sc,[hidden]";
const ignoredBlocks = ignored + ',.navbox,.toc,[role="note"]';
const regions = new Set([
    "au",
    "aus",
    "australia",
    "australian",
    "belgium",
    "brazil",
    "ca",
    "canada",
    "china",
    "cn",
    "cz",
    "de",
    "denmark",
    "en",
    "english",
    "fr",
    "france",
    "german",
    "germany",
    "hu",
    "hungary",
    "it",
    "italy",
    "japan",
    "jp",
    "netherlands",
    "norway",
    "ph",
    "pl",
    "poland",
    "portugal",
    "ru",
    "russia",
    "sa",
    "spain",
    "uk",
    "us",
    "usa",
    "united states",
    "united kingdom",
]);
const wikiHost = /(?:^|\.)(?:wikipedia|wikimedia)\.org$/u;
const bareDomain = /^(?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/[^\s()]*)?$/iu;
const temporalNote =
    /\b(?:before|after|since|prior to|until|from|between|as of|pre|post|during|through)\b.{0,40}\b(?:19|20)\d{2}\b/iu;

function compact(text: string): string {
    return text.replace(/\s+/gu, " ").trim();
}

function cleanClone(node: Element): Element {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll(ignored).forEach((item) => item.remove());
    clone.querySelectorAll("br").forEach((item) => item.replaceWith(" "));
    return clone;
}

function cleanText(node?: Element | null): string {
    return node ? compact(cleanClone(node).textContent ?? "") : "";
}

export function httpUrl(value: string | null, base?: string): URL | null {
    if (!value?.trim()) return null;
    try {
        const url = new URL(value, base);
        return (url.protocol === "http:" || url.protocol === "https:") &&
            !url.username &&
            !url.password
            ? url
            : null;
    } catch {
        return null;
    }
}

export function normalizeHost(host: string): string {
    return host
        .toLowerCase()
        .replace(/^www\./u, "")
        .replace(/\.$/u, "");
}

function discussionUrl(link: Element): string | null {
    const url = httpUrl(link.getAttribute("href"), SOURCE_URL);
    if (!url || !wikiHost.test(url.hostname)) return null;
    const title = url.pathname.startsWith("/wiki/")
        ? url.pathname.slice(6)
        : (url.searchParams.get("title") ?? "");
    if (/^(?:Wikipedia(?:(?:[_ ]|%20)talk)?|Talk)(?::|%3a)/iu.test(title))
        return url.href;
    if (
        url.pathname === "/w/index.php" &&
        url.searchParams.has("oldid") &&
        /^\d+$/u.test(cleanText(link))
    ) {
        return url.href;
    }
    return null;
}

function discussions(...nodes: (Element | null)[]): string[] {
    const links = new Set<string>();
    for (const node of nodes) {
        for (const link of Array.from(
            node?.querySelectorAll("a[href]") ?? [],
        )) {
            if (link.closest(ignored)) continue;
            const url = discussionUrl(link);
            if (url) links.add(url);
        }
    }
    return [...links];
}

function namesFor(
    name: string,
    anchor: string,
    scoped: boolean,
): Pick<SourceRecord, "aliases" | "scopedAliases"> {
    const aliases = new Set([name]);
    const qualifiers = Array.from(
        name.matchAll(/\(([^)]+)\)/gu),
        ([, qualifier]) => qualifier,
    );
    const rowName =
        anchor && !/^h-/u.test(anchor) ? anchor.replace(/_/gu, " ") : "";
    const regional = qualifiers
        .flatMap((qualifier) => qualifier.split(/[,;/]/u))
        .some((part) =>
            regions.has(
                part
                    .trim()
                    .toLowerCase()
                    .replace(/\s+(?:edition|language|version)$/u, ""),
            ),
        );
    if (regional) {
        return {
            aliases: [name],
            scopedAliases: rowName && scoped ? [rowName] : undefined,
        };
    }
    if (rowName) aliases.add(rowName);
    for (const part of name.split(/\s+\/\s+/u)) {
        aliases.add(part);
        aliases.add(compact(part.replace(/\([^)]*\)/gu, "")));
    }
    for (const qualifier of qualifiers) {
        const former = qualifier.match(/^formerly\s+(.+)/iu);
        if (former) aliases.add(compact(former[1]));
        else {
            for (const part of qualifier.split(",").map(compact)) {
                if (
                    /^[\p{L}\p{N}&!.-]{2,16}$/u.test(part) &&
                    !/^(?:website|magazine|\d+)$/iu.test(part)
                ) {
                    aliases.add(part);
                }
            }
        }
    }
    for (const alias of [...aliases]) {
        if (/, The$/u.test(alias)) aliases.add("The " + alias.slice(0, -5));
    }
    return { aliases: [...aliases].filter(Boolean) };
}

function urlRules(values: (string | null)[]): UrlRule[] {
    const rules = new Map<string, UrlRule>();
    for (const value of values) {
        const url = httpUrl(value, SOURCE_URL);
        if (!url) continue;
        const host = normalizeHost(url.hostname);
        if (
            wikiHost.test(host) ||
            /(?:^|\.)archive\.org$/u.test(host) ||
            /^archive\.[a-z]+$/u.test(host)
        )
            continue;
        const path = url.pathname.replace(/\/+$/u, "") || "/";
        rules.set(host + path, { host, path });
    }
    return [...rules.values()];
}

function tableRows(
    table: HTMLTableElement,
): Array<{ row: HTMLTableRowElement; cells: HTMLTableCellElement[] }> {
    const grid: ReturnType<typeof tableRows> = [];
    for (const group of new Set(
        Array.from(table.rows, (row) => row.parentElement),
    )) {
        const rows = Array.from(table.rows).filter(
            (row) => row.parentElement === group,
        );
        const carried = new Map<
            number,
            { cell: HTMLTableCellElement; end: number }
        >();
        for (const [index, row] of rows.entries()) {
            const cells: HTMLTableCellElement[] = [];
            for (const [column, { cell, end }] of carried) {
                if (index < end) cells[column] = cell;
                else carried.delete(column);
            }
            let column = 0;
            for (const cell of Array.from(row.cells)) {
                while (cells[column]) column += 1;
                const end =
                    cell.rowSpan === 0 ? rows.length : index + cell.rowSpan;
                for (let offset = 0; offset < cell.colSpan; offset += 1) {
                    cells[column + offset] = cell;
                    if (end > index + 1)
                        carried.set(column + offset, { cell, end });
                }
                column += cell.colSpan;
            }
            grid.push({ row, cells });
        }
    }
    return grid;
}

function footnoteText(
    node: Element | null,
    fragment: DocumentFragment,
): string[] {
    return Array.from(
        node?.querySelectorAll('sup a[href^="#"]') ?? [],
        (link) => {
            const hash = link.getAttribute("href")!.slice(1);
            const note = fragment.getElementById(hash);
            return cleanText(note?.querySelector(".reference-text"));
        },
    ).filter(Boolean);
}

type Entry = Pick<
    SourceRecord,
    "name" | "urlRules" | "dates" | "notes" | "discussions" | "temporal"
> & {
    element: Element;
    identity: Element;
    nameAnchor: string;
    status?: SourceStatus;
};

function tableEntries(
    table: HTMLTableElement,
    fragment: DocumentFragment,
): Entry[] {
    const grid = tableRows(table);
    const [header, ...rows] = grid;
    if (!header) return [];
    const headings = header.cells.map((cell) => cleanText(cell).toLowerCase());
    const nameColumn = headings.indexOf("name");
    const mediaColumn = headings.indexOf("media");
    if (nameColumn < 0 || mediaColumn < 0) return [];
    const dateColumn = headings.indexOf("dates");
    const noteColumn = headings.findIndex((heading) =>
        /^notes?\b/u.test(heading),
    );
    const statusColumn = headings.findIndex((heading) =>
        /^(?:status|reliability)$/u.test(heading),
    );
    const discussionColumn = headings.findIndex((heading) =>
        /\bdiscussions?\b/u.test(heading),
    );
    const entries: Entry[] = [];
    for (const { row, cells } of rows) {
        const nameCell = cells[nameColumn];
        const mediaCell = cells[mediaColumn];
        if (!nameCell || !mediaCell || nameCell === mediaCell) continue;
        const name = cleanText(nameCell);
        if (
            !name ||
            name.length > 300 ||
            (nameCell.tagName === "TH" && name.toLowerCase() === "name")
        )
            continue;
        const noteCell = cells[noteColumn] ?? null;
        const notes = [
            ...new Set(
                [
                    cleanText(noteCell),
                    ...footnoteText(noteCell, fragment),
                ].filter(Boolean),
            ),
        ].join("\n\n");
        const statusText = cleanText(cells[statusColumn]).toLowerCase();
        const status = sourceStatuses.find(
            (category) => category === statusText,
        );
        const links = Array.from(
            cleanClone(mediaCell).querySelectorAll("a[href]"),
            (link) => link.getAttribute("href"),
        );
        const identity = nameCell.parentElement ?? row;
        entries.push({
            name,
            element: row,
            identity,
            nameAnchor: identity.id || nameCell.id || "",
            dates: cleanText(cells[dateColumn]),
            notes,
            discussions: discussions(
                noteCell,
                cells[discussionColumn] ?? null,
            ),
            status,
            temporal: nameCell.rowSpan !== 1 || temporalNote.test(notes),
            urlRules: urlRules(links),
        });
    }
    return entries;
}

function listEntries(list: Element): Entry[] {
    const entries: Entry[] = [];
    for (const item of Array.from(list.children)) {
        if (item.tagName !== "LI") continue;
        const clone = cleanClone(item);
        clone.querySelectorAll("ul,ol").forEach((node) => node.remove());
        const related = discussions(clone);
        const anchors = Array.from(clone.querySelectorAll("a[href]"));
        for (const link of anchors) {
            if (discussionUrl(link) || /^\d+$/u.test(cleanText(link)))
                link.remove();
        }
        const name = compact(clone.textContent ?? "").replace(/[\s,;]+$/u, "");
        if (!name || name.length > 300) continue;

        const parts = name.split(/\s+\/\s+/u);
        const links: (string | null)[] = [];
        for (const link of Array.from(clone.querySelectorAll("a[href]"))) {
            const label = cleanText(link);
            const url = httpUrl(link.getAttribute("href"), SOURCE_URL);
            if (
                label &&
                parts.some(
                    (part) =>
                        part === label ||
                        part.startsWith(label + " (") ||
                        (bareDomain.test(label) &&
                            part.includes("(" + label + ")")),
                )
            ) {
                if (url) links.push(url.href);
            }
            // Use the linked destination as the rule for a linked hostname.
            link.replaceWith(
                url && !wikiHost.test(url.hostname) ? " " : label,
            );
        }
        const unlinked = clone.textContent ?? "";
        for (const part of unlinked.split(/\s+\/\s+/u)) {
            const base = part.split("(")[0].trim();
            const qualifiers = Array.from(
                part.matchAll(/\(([^()]+)\)/gu),
                ([, text]) => text.split(","),
            ).flat();
            const names = [base, ...qualifiers.map(compact)];
            links.push(
                ...names
                    .filter((text) => bareDomain.test(text))
                    .map((text) => "https://" + text),
            );
        }
        entries.push({
            name,
            element: item,
            identity: item,
            nameAnchor: item.id,
            dates: "",
            notes: "",
            discussions: related,
            temporal: /\b(?:19|20)\d{2}\s*[-–—]/u.test(name),
            urlRules: urlRules(links),
        });
    }
    return entries;
}

export function parseSourceTable(
    document: Document,
    html: string,
): SourceTable {
    if (html.length > MAX_SOURCE_LENGTH) throw new Error("來源表 HTML 過大。");

    // The detached template keeps remote markup and its resources inert.
    const template = document.implementation
        .createHTMLDocument("")
        .createElement("template");
    template.innerHTML = html;
    const fragment = template.content;
    const root = fragment.querySelector(".mw-parser-output") ?? fragment;
    const records: SourceRecord[] = [];
    const sectionCounts = {
        reliable: 0,
        situational: 0,
        unreliable: 0,
        inconclusive: 0,
    };
    const contexts: Context[] = [];
    const entryContexts: Context[][] = [];
    const keys = new Map<Element, string>();
    let active: SourceStatus | undefined;

    for (const node of Array.from(
        root.querySelectorAll("h2,h3,h4,h5,h6,table,ul,ol,p"),
    )) {
        if (
            node.closest(ignoredBlocks) ||
            node.parentElement?.closest("table,li")
        )
            continue;
        if (/^H[2-6]$/u.test(node.tagName)) {
            const level = Number(node.tagName.slice(1));
            const title = cleanText(node);
            if (level === 2) active = sections.get(title.toLowerCase());
            while (
                contexts.length &&
                contexts[contexts.length - 1].level >= level
            )
                contexts.pop();
            if (active) {
                contexts.push({
                    level,
                    title,
                    anchor:
                        node.id ||
                        node.querySelector("[id]")?.id ||
                        title.replace(/ /gu, "_"),
                    notes: [],
                });
            }
            continue;
        }
        if (!active || !contexts.length) continue;
        const context = contexts[contexts.length - 1];
        if (node.tagName === "P") {
            const note = cleanText(node);
            if (note) context.notes.push(note);
            continue;
        }
        const entries =
            node.tagName === "TABLE"
                ? tableEntries(node as HTMLTableElement, fragment)
                : active === "unreliable" || active === "inconclusive"
                  ? listEntries(node)
                  : [];
        for (const {
            element,
            identity,
            nameAnchor,
            status,
            ...entry
        } of entries) {
            const sourceKey = keys.get(identity) ?? String(keys.size);
            keys.set(identity, sourceKey);
            records.push({
                ...entry,
                sourceKey,
                anchor: element.id || nameAnchor || context.anchor,
                ...namesFor(
                    entry.name,
                    nameAnchor,
                    Boolean(entry.urlRules.length),
                ),
                status: status ?? active,
                section: contexts[0].title,
                subsection: contexts
                    .slice(1)
                    .map(({ title }) => title)
                    .join(" / "),
                primary: contexts.some(({ title }) =>
                    /primary\/affiliate/iu.test(title),
                ),
                contextNotes: "",
            });
            entryContexts.push([...contexts]);
            sectionCounts[active] += 1;
        }
    }
    if (
        records.length < 30 ||
        sourceStatuses.some((status) => !sectionCounts[status])
    ) {
        throw new Error("來源表不完整或格式已改變。");
    }
    records.forEach((record, index) => {
        record.contextNotes = [
            ...new Set(entryContexts[index].flatMap(({ notes }) => notes)),
        ].join("\n\n");
    });
    return { records, sectionCounts };
}
