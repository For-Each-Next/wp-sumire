import { scanWikitext } from "../shared/wikitext-scan.ts";
import { formatPageTitle } from "./page-title.ts";

export interface TranslationNote {
    site: string;
    title: string;
    authors: string;
    partly: boolean;
    source?: string;
}

export type TranslationField = "site" | "title" | "authors";

const siteCode = /^[a-z][a-z0-9-]*$/u;
const unsafeArgument = /[|[\]{}<>\u0000-\u001f\u007f-\u009f]/u;

function authorNames(value: string): string[] {
    return value
        .split(/\r\n|\n|\r/u)
        .map((name) => name.trim())
        .filter(Boolean);
}

function sourceTitle(value: string): string {
    return formatPageTitle(value.trim()).trim();
}

export function invalidTranslationField(
    note: TranslationNote,
): TranslationField | null {
    if (!siteCode.test(note.site.trim().toLowerCase())) return "site";

    const title = sourceTitle(note.title);
    const page = title
        .split("#", 1)[0]
        .replaceAll("'''", "")
        .replaceAll("''", "")
        .trim();
    if (unsafeArgument.test(title) || !page) return "title";

    if (
        authorNames(note.authors).some(
            (name) => unsafeArgument.test(name) || name.includes("#"),
        )
    )
        return "authors";
    return null;
}

export function parseTranslationNote(
    wikitext: string,
): TranslationNote | null {
    const text = wikitext.trim();
    if (/[\r\n]/u.test(text)) return null;
    const [template] = scanWikitext(text);
    if (
        template?.kind !== "template" ||
        template.start !== 0 ||
        template.end !== text.length ||
        text.slice(template.parts[0].start, template.parts[0].end).trim() !==
            "/"
    )
        return null;

    const positional = new Map<number, string>();
    let unnamed = 0;
    let partly: boolean | undefined;
    for (const { start, end, equals } of template.parts.slice(1)) {
        const value = text
            .slice(equals === undefined ? start : equals + 1, end)
            .trim();
        const key =
            equals === undefined
                ? String(++unnamed)
                : text.slice(start, equals).trim();
        if (key === "partly") {
            if (partly !== undefined || (value !== "yes" && value !== "no"))
                return null;
            partly = value === "yes";
            continue;
        }
        if (!/^[1-9]\d*$/u.test(key)) return null;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || positional.has(index) || !value)
            return null;
        positional.set(index, value);
    }

    // The wrapper shifts arguments once before dispatching, and the renderer
    // stops reading authors at the first omitted slot.
    const site = positional.get(2);
    const title = positional.get(3);
    if (positional.get(1) !== "trans" || !site || !title) return null;
    const authors: string[] = [];
    for (let index = 4; index <= positional.size; index++) {
        const author = positional.get(index);
        if (author === undefined) return null;
        authors.push(author);
    }

    const note: TranslationNote = {
        site: site.toLowerCase(),
        title: sourceTitle(title),
        authors: authors.join("\n"),
        partly: partly ?? false,
        source: wikitext,
    };
    return invalidTranslationField(note) ? null : note;
}

export function serializeTranslationNote(note: TranslationNote): string {
    const invalid = invalidTranslationField(note);
    if (invalid)
        throw new RangeError(`Invalid translation source ${invalid}.`);

    const site = note.site.trim().toLowerCase();
    const title = sourceTitle(note.title);
    const authors = authorNames(note.authors);
    if (note.source !== undefined) {
        const previous = parseTranslationNote(note.source);
        if (
            previous &&
            previous.site === site &&
            previous.title === title &&
            previous.authors === authors.join("\n") &&
            previous.partly === note.partly
        )
            return note.source;
    }

    // After an explicit assignment, later unnamed parameters would start at
    // the same slot, so number every remaining positional argument as well.
    let numbered = false;
    const arguments_ = ["trans", site, title, ...authors].map(
        (value, index) => {
            numbered ||= value.includes("=");
            return numbered ? `${index + 1}=${value}` : value;
        },
    );
    if (note.partly) arguments_.push("partly=yes");
    return `{{/|${arguments_.join("|")}}}`;
}
