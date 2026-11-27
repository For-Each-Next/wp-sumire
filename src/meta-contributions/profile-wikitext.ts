import {
    scanWikitext,
    visitWikitext,
    type Span,
    type WikitextElement,
    type WikitextNode,
} from "../shared/wikitext-scan.ts";

export class ProfileFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProfileFormatError";
    }
}

export interface Line extends Span {
    text: string;
    newline: string;
}

interface Heading extends Span {
    level: number;
    name: string;
}

interface FieldLine extends Span {
    line: Line;
    value: string;
}

interface Field {
    name: string;
    lines: FieldLine[];
}

export type RenderedLine = Pick<Line, "text" | "newline">;

export interface RecordSource extends Span {
    fields: Field[];
}

const lineBreak = /\r\n|\n|\r/u;
const commentPattern = /<!--[\s\S]*?-->/gu;
const fieldStart = /^\s*;\s*([\p{L}\p{N}_-]+)\s*:/u;
const continuationStart = /^\s*:/u;

export function linesOf(text: string): Line[] {
    const lines: Line[] = [];
    for (const match of text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/gu)) {
        if (match[0]) {
            lines.push({
                start: match.index,
                end: match.index + match[1].length,
                text: match[1],
                newline: match[2],
            });
        }
    }
    return lines;
}

export function sourceText(source: string, span: Span): string {
    return source.slice(span.start, span.end);
}

function visibleText(text: string): string {
    return text.replace(commentPattern, "").trim();
}

export function headingsOf(source: string, nodes: WikitextNode[]): Heading[] {
    const headings: Heading[] = [];
    let nodeIndex = 0;
    for (const line of linesOf(source)) {
        if (!line.text.startsWith("=")) continue;
        while (nodes[nodeIndex]?.end <= line.start) nodeIndex++;
        if (nodes[nodeIndex]?.start <= line.start) continue;
        const heading = /^(={1,6})([^=].*?)(=+)\s*$/u.exec(
            visibleText(line.text),
        );
        if (heading && heading[1].length === heading[3].length) {
            headings.push({
                start: line.start,
                end: line.end,
                level: heading[1].length,
                name: heading[2].trim().replace(/\s+/gu, " ").toLowerCase(),
            });
        }
    }
    return headings;
}

function argumentName(source: string, start: number, equals: number): string {
    return visibleText(source.slice(start, equals));
}

function matchesMode(
    source: string,
    node: WikitextElement,
    mode: string,
): boolean {
    if (visibleText(sourceText(source, node.parts[0])) !== "/") return false;
    const modes: string[] = [];
    let unnamed = 0;
    for (const part of node.parts.slice(1)) {
        if (part.equals === undefined) {
            if (++unnamed === 1)
                modes.push(visibleText(sourceText(source, part)));
        } else if (argumentName(source, part.start, part.equals) === "1") {
            modes.push(visibleText(source.slice(part.equals + 1, part.end)));
        }
    }
    if (!modes.includes(mode)) return false;
    if (modes.length > 1) {
        throw new ProfileFormatError(
            "A profile template declares its mode more than once.",
        );
    }
    return true;
}

export function templateParameter(
    source: string,
    node: WikitextElement,
    name: string,
): Span | undefined {
    const matches: Span[] = [];
    for (const part of node.parts.slice(1)) {
        if (
            part.equals !== undefined &&
            argumentName(source, part.start, part.equals) === name
        ) {
            matches.push({ start: part.equals + 1, end: part.end });
        }
    }
    if (matches.length > 1) {
        throw new ProfileFormatError(
            `A profile template declares ${name} more than once.`,
        );
    }
    return matches[0];
}

export function readDataTemplate(
    source: string,
    nodes: WikitextNode[],
    section: Span,
    mode: string,
) {
    const templates = nodes.filter(
        (node): node is WikitextElement =>
            node.kind === "template" &&
            node.start >= section.start &&
            node.end <= section.end &&
            matchesMode(source, node, mode),
    );
    if (templates.length !== 1)
        throw new ProfileFormatError(`Expected one ${mode} profile template.`);
    const [template] = templates;
    const span = templateParameter(source, template, "data");
    if (!span)
        throw new ProfileFormatError(
            `The ${mode} profile template is missing data.`,
        );
    const data = sourceText(source, span);
    const newline =
        lineBreak.exec(data)?.[0] ?? lineBreak.exec(source)?.[0] ?? "\n";
    return { template, span, data, newline };
}

function normalizeDefaultSite(site: string): string {
    const value = visibleText(site).toLowerCase();
    return /^[a-z][a-z0-9-]*$/u.test(value) ? value : "en";
}

export function readDefaultSite(
    source: string,
    template: WikitextElement,
): string {
    const site = templateParameter(source, template, "site");
    return normalizeDefaultSite(site ? sourceText(source, site) : "");
}

export function renderRecordTemplate(
    mode: string,
    data: string,
    defaultSite?: string,
): string {
    const site =
        defaultSite === undefined
            ? ""
            : `|site=${normalizeDefaultSite(defaultSite)}`;
    return `{{/|${mode}${site}|data=\n${data}\n}}`;
}

export function fieldValue(field: Field | undefined): string {
    return field?.lines.map(({ value }) => value).join("\n") ?? "";
}

export function commentRanges(data: string): Span[] {
    const comments: Span[] = [];
    visitWikitext(scanWikitext(data), (node) => {
        if (node.kind === "comment") {
            comments.push(node);
        } else if (lineBreak.test(sourceText(data, node))) {
            throw new ProfileFormatError(
                "Use continuation lines with balanced inline wikitext in profile fields.",
            );
        }
    });
    return comments;
}

function commentsAsSpaces(data: string, comments: Span[]): string {
    const pieces: string[] = [];
    let offset = 0;
    for (const comment of comments) {
        pieces.push(
            data.slice(offset, comment.start),
            sourceText(data, comment).replace(/[^\r\n]/g, " "),
        );
        offset = comment.end;
    }
    pieces.push(data.slice(offset));
    return pieces.join("");
}

function readFieldLine(
    line: Line,
    visible: string,
    prefixLength: number,
): FieldLine {
    const raw = line.text.slice(prefixLength);
    const masked = visible.slice(prefixLength);
    const exposed = masked.trim();
    const start =
        prefixLength +
        (exposed
            ? masked.length - masked.trimStart().length
            : raw.length - raw.trimStart().length);
    const end = exposed ? prefixLength + masked.trimEnd().length : start;
    return { line, start, end, value: line.text.slice(start, end) };
}

export function readRecords(data: string): RecordSource[] {
    const records: RecordSource[] = [];
    const comments = commentRanges(data);
    const masked = commentsAsSpaces(data, comments);
    let record: Field[] = [];
    let commentIndex = 0;

    function commit() {
        if (record.length) {
            const first = record[0].lines[0].line;
            const lines = record[record.length - 1].lines;
            const last = lines[lines.length - 1].line;
            records.push({
                start: first.start,
                end: last.end,
                fields: record,
            });
            record = [];
        }
    }

    for (const line of linesOf(data)) {
        while (comments[commentIndex]?.end <= line.start) commentIndex++;
        const comment = comments[commentIndex];
        const touchesComment =
            comment && comment.start < line.end + line.newline.length;
        const visible = sourceText(masked, line);
        if (!visible.trim()) {
            if (!touchesComment) commit();
            continue;
        }
        for (
            let index = commentIndex;
            comments[index]?.start < line.end;
            index++
        ) {
            if (
                comments[index].start < line.start ||
                comments[index].end > line.end
            ) {
                throw new ProfileFormatError(
                    "Multiline comments in a profile field must be on their own lines.",
                );
            }
        }
        const field = fieldStart.exec(visible);
        if (field) {
            record.push({
                name: field[1].toLowerCase(),
                lines: [readFieldLine(line, visible, field[0].length)],
            });
            continue;
        }
        const continuation = continuationStart.exec(visible);
        const previous = record[record.length - 1];
        if (!continuation || !previous) {
            throw new ProfileFormatError("Unrecognized profile record data.");
        }
        previous.lines.push(
            readFieldLine(line, visible, continuation[0].length),
        );
    }
    commit();
    return records;
}

export function editableValue(value: string): string {
    if (!value.includes("<!--")) return value;
    return (
        linesOf(value)
            .map((line) => {
                const masked = commentsAsSpaces(
                    line.text,
                    commentRanges(line.text),
                );
                return readFieldLine(line, masked, 0).value;
            })
            .join("\n") + (value.endsWith("\n") ? "\n" : "")
    );
}

export function normalizeFieldLines(value: string): string {
    return value
        .split(lineBreak)
        .map((line) => line.trim())
        .join("\n");
}

export function normalizeValue(value: string): string {
    if (
        typeof value !== "string" ||
        /[\u0000-\u0008\u000e-\u001f\u007f]/u.test(value)
    ) {
        throw new ProfileFormatError(
            "Profile fields must contain valid text.",
        );
    }
    return normalizeFieldLines(value);
}

export function generatedField(key: string, value: string): string[] {
    checkChangedValue(value);
    const lines = value.split("\n");
    return [
        `; ${key} : ${lines[0]}`,
        ...lines.slice(1).map((line) => `: ${line}`),
    ];
}

function checkInlineMarkup(value: string) {
    const input = `{{Check|data=${value}\n|end=1}}`;
    const [node] = scanWikitext(input);
    if (
        node?.kind !== "template" ||
        node.start !== 0 ||
        node.end !== input.length ||
        node.parts.length !== 3 ||
        node.parts[1].end !== input.length - "|end=1}}".length
    ) {
        throw new ProfileFormatError(
            "Balance wikitext brackets and escape literal pipes inside profile fields.",
        );
    }
    // The template preprocessor does not protect an external link or HTML
    // tag attribute from template separators just because it is bracketed.
    visitWikitext(node.children, (child) => {
        if (
            (child.kind === "external-link" ||
                child.kind === "language-converter") &&
            /\||\{\{|\}\}/u.test(sourceText(input, child))
        ) {
            throw new ProfileFormatError(
                "Escape template delimiters inside external links and language variants.",
            );
        }
    });
    for (const [tag] of visibleText(value).matchAll(
        /<\/?[a-z][^<>\r\n]*>/giu,
    )) {
        if (/\||\{\{|\}\}/u.test(tag)) {
            throw new ProfileFormatError(
                "Escape template delimiters inside HTML tags.",
            );
        }
    }
}

function checkChangedValue(value: string) {
    for (const line of value.split("\n")) checkInlineMarkup(line);
}

export function renderExistingField(
    data: string,
    field: Field,
    value: string | null,
    newline: string,
): RenderedLine[] {
    if (value !== null && value !== fieldValue(field))
        checkChangedValue(value);
    const next = value?.split("\n") ?? [];
    const first = field.lines[0].line;
    const last = field.lines[field.lines.length - 1].line;
    const changes = new Map(
        field.lines.map((part, index) => {
            const raw = part.line.text;
            const replacement =
                index < next.length
                    ? raw.slice(0, part.start) +
                      next[index] +
                      raw.slice(part.end)
                    : commentRanges(raw)
                          .map((comment) => sourceText(raw, comment))
                          .join(" ") || null;
            return [part.line.start - first.start, replacement] as const;
        }),
    );

    const rendered: RenderedLine[] = [];
    for (const line of linesOf(
        data.slice(first.start, last.end + last.newline.length),
    )) {
        const text = changes.has(line.start)
            ? changes.get(line.start)
            : line.text;
        if (text != null)
            rendered.push({ text, newline: line.newline || newline });
    }
    for (const text of next.slice(field.lines.length))
        rendered.push({ text: `: ${text}`, newline });
    return rendered;
}

export function editRecord(
    data: string,
    original: RecordSource,
    newline: string,
) {
    const replacements = new Map<
        number,
        { end: number; lines: RenderedLine[] }
    >();
    const additions: RenderedLine[] = [];

    function replaceField(field: Field, lines: RenderedLine[]) {
        const end = field.lines[field.lines.length - 1].line.end;
        replacements.set(field.lines[0].line.start, { end, lines });
    }

    function update(
        field: Field | undefined,
        key: string,
        value: string | null,
    ) {
        if (field)
            replaceField(
                field,
                renderExistingField(data, field, value, newline),
            );
        else if (value !== null)
            additions.push(
                ...generatedField(key, value).map((text) => ({
                    text,
                    newline,
                })),
            );
    }

    function changeField(key: string, value: string) {
        const occurrences = original.fields.filter(
            (field) => field.name === key,
        );
        update(
            occurrences[0],
            key,
            value || (occurrences.length > 1 ? "" : null),
        );
    }

    function render(trailing: RenderedLine[] = []): string {
        const source = sourceText(data, original);
        if (!replacements.size && !additions.length && !trailing.length)
            return source;

        const rendered: RenderedLine[] = [];
        let replacementEnd = 0;
        for (const line of linesOf(source)) {
            const offset = original.start + line.start;
            if (offset < replacementEnd) continue;
            const replacement = replacements.get(offset);
            if (replacement) {
                rendered.push(...replacement.lines);
                replacementEnd = replacement.end;
            } else {
                rendered.push({
                    text: line.text,
                    newline: line.newline || newline,
                });
            }
        }
        rendered.push(...additions, ...trailing);
        return rendered
            .map(
                ({ text, newline }, index) =>
                    text + (index + 1 < rendered.length ? newline : ""),
            )
            .join("");
    }

    return { replaceField, update, changeField, render };
}

export function renderRecords(
    section: { data: string; newline: string; records: RecordSource[] },
    rendered: readonly string[],
): string {
    const blank = section.newline + section.newline;
    const first = section.records[0];
    if (!first) {
        if (!rendered.length) return section.data;
        const separator = section.data.endsWith(blank)
            ? ""
            : lineBreak.test(section.data.slice(-1))
              ? section.newline
              : blank;
        return section.data + separator + rendered.join(blank) + blank;
    }
    const last = section.records[section.records.length - 1];
    const between = section.records
        .slice(1)
        .map((record, index) =>
            section.data.slice(section.records[index].end, record.start),
        );
    const remaining = between
        .slice(Math.max(0, rendered.length - 1))
        .filter((gap) => /\S/u.test(gap));
    const body = rendered
        .map(
            (record, index) =>
                (index === 0 ? "" : (between[index - 1] ?? blank)) + record,
        )
        .join("");
    return (
        section.data.slice(0, first.start) +
        body +
        remaining.join("") +
        section.data.slice(last.end)
    );
}
