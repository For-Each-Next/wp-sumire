import { scanWikitext } from "../shared/wikitext-scan.ts";
import {
    editableValue,
    editRecord,
    fieldValue,
    generatedField,
    headingsOf,
    normalizeValue,
    ProfileFormatError,
    readDataTemplate,
    readDefaultSite,
    readRecords,
    renderRecordTemplate,
    renderRecords,
    templateParameter,
    type RecordSource,
} from "./profile-wikitext.ts";

export const profileHeadings = {
    contributions: "Contributions",
    userboxes: "Userboxes",
    barnstars: "Barnstars",
    quotations: "Quotations",
} as const;

export type ProfileSectionId = keyof typeof profileHeadings;

export const profileRecordFields = {
    userboxes: ["badge", "color", "text", "tip"],
    barnstars: ["label", "file", "site", "link", "by", "date"],
    quotations: [
        "lang",
        "text",
        "author",
        "source",
        "text-link",
        "text-find",
        "lit",
        "trans",
        "trans-link",
        "trans-find",
    ],
} as const;

// Existing records can still use these fields for display on Meta-Wiki.
const storedRecordFields = {
    userboxes: [...profileRecordFields.userboxes, "level", "tone"],
    barnstars: profileRecordFields.barnstars,
    quotations: [
        ...profileRecordFields.quotations,
        "text-link-label",
        "trans-link-label",
    ],
} as const;

export type ProfileRecordSectionId = keyof typeof profileRecordFields;
export type ProfileRecordField =
    (typeof storedRecordFields)[ProfileRecordSectionId][number];
export const profileRecordSectionIds = Object.keys(
    profileRecordFields,
) as ProfileRecordSectionId[];

export const requiredProfileFields = {
    userboxes: ["badge", "text"],
    barnstars: ["file"],
    quotations: ["text"],
} as const;

export interface ProfileRecord {
    id: string;
    fields: Partial<Record<ProfileRecordField, string>>;
}

export interface ProfileRecordSection {
    defaultSite: string;
    entries: ProfileRecord[];
}

function readSection(source: string, id: ProfileRecordSectionId) {
    const nodes = scanWikitext(source);
    const headings = headingsOf(source, nodes);
    let start = 0;
    let end = headings[0]?.start ?? source.length;
    if (id !== "userboxes") {
        const matches = headings.filter(
            ({ level, name }) => level === 2 && name === id,
        );
        if (matches.length !== 1)
            throw new ProfileFormatError(
                `Expected one ${profileHeadings[id]} heading.`,
            );
        const [heading] = matches;
        start = heading.end;
        end =
            headings.find(
                (other) =>
                    other.start > heading.start &&
                    other.level <= heading.level,
            )?.start ?? source.length;
    }
    const block = readDataTemplate(source, nodes, { start, end }, id);
    return { ...block, records: readRecords(block.data) };
}

function readField(record: RecordSource, key: ProfileRecordField) {
    return fieldValue(record.fields.find(({ name }) => name === key));
}

function normalizeFields(
    id: ProfileRecordSectionId,
    fields: ProfileRecord["fields"],
    needsContent: boolean,
    origin?: RecordSource,
) {
    const values = Object.fromEntries(
        storedRecordFields[id].map((key) => {
            const value = normalizeValue(fields[key] ?? "");
            if (
                (key === "text-find" || key === "trans-find") &&
                (!origin || value !== readField(origin, key))
            ) {
                // The quotation template reads literal line-break escapes in highlights.
                return [key, value.trim().replaceAll("\n", "\\n")];
            }
            return [key, value];
        }),
    );
    const required = requiredProfileFields[id];
    if (
        needsContent &&
        !required.some((key) => editableValue(values[key]).trim())
    ) {
        throw new ProfileFormatError(
            `A ${id} record requires ${required.join(" or ")}.`,
        );
    }
    return values;
}

function renderNewRecord(
    id: ProfileRecordSectionId,
    values: Record<string, string>,
    newline: string,
): string {
    return storedRecordFields[id]
        .flatMap((key) =>
            values[key] ? generatedField(key, values[key]) : [],
        )
        .join(newline);
}

export function renderProfileRecordItem(
    id: ProfileRecordSectionId,
    defaultSite: string,
    entry: ProfileRecord,
): string {
    const data = renderNewRecord(
        id,
        normalizeFields(id, entry.fields, true),
        "\n",
    );
    return renderRecordTemplate(
        id,
        data,
        id === "barnstars" ? defaultSite : undefined,
    );
}

export function parseProfileRecords(
    source: string,
    id: ProfileRecordSectionId,
) {
    const section = readSection(source, id);
    const keys = storedRecordFields[id];
    const required = requiredProfileFields[id];
    const defaultSite =
        id === "barnstars" ? readDefaultSite(source, section.template) : "";
    const entries: ProfileRecord[] = section.records.map((record, index) => ({
        id: `${id}:${index + 1}`,
        fields: Object.fromEntries(
            keys.map((key) => [key, readField(record, key)]),
        ),
    }));
    const origins = new Map(
        entries.map((entry, index) => [entry.id, section.records[index]]),
    );

    function withEntries(selected: readonly ProfileRecord[]): string {
        const seen = new Set<string>();
        const edits = selected.map(({ id: entryId, fields }) => {
            if (!entryId || seen.has(entryId))
                throw new ProfileFormatError(
                    "Each profile record needs a distinct ID.",
                );
            seen.add(entryId);
            const origin = origins.get(entryId);
            const needsContent =
                !origin ||
                required.some((key) => readField(origin, key).trim());
            return {
                values: normalizeFields(id, fields, needsContent, origin),
                origin,
            };
        });
        const rendered = edits.map(({ values, origin }) => {
            if (!origin) return renderNewRecord(id, values, section.newline);
            const record = editRecord(section.data, origin, section.newline);
            for (const key of keys) {
                if (values[key] !== readField(origin, key))
                    record.changeField(key, values[key]);
            }
            return record.render();
        });
        const data = renderRecords(section, rendered);
        if (data === section.data) return source;

        const { start, end } = section.span;
        const result = source.slice(0, start) + data + source.slice(end);
        const verified = readSection(result, id);
        if (
            verified.span.start !== start ||
            verified.span.end !== start + data.length ||
            verified.records.length !== edits.length ||
            edits.some(({ values }, index) =>
                keys.some((key) => {
                    const actual = readField(verified.records[index], key);
                    return (
                        actual !== values[key] &&
                        actual !== editableValue(values[key])
                    );
                }),
            )
        ) {
            throw new ProfileFormatError(
                `The edits change the ${id} template or record structure.`,
            );
        }
        return result;
    }

    return { defaultSite, entries, withEntries };
}

export function showAllQuotations(source: string): string {
    const { template, records } = readSection(source, "quotations");
    if (!records.length) return source;
    const show = templateParameter(source, template, "show");
    if (show)
        return (
            source.slice(0, show.start) +
            records.length +
            source.slice(show.end)
        );
    return (
        source.slice(0, template.closeStart) +
        `|show=${records.length}` +
        source.slice(template.closeStart)
    );
}
