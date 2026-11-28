import { diffArrays } from "diff";

interface LineChange {
    start: number;
    end: number;
    text: string;
}

function splitLines(text: string): string[] {
    return text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+/gu) ?? [];
}

function lineChanges(base: string[], text: string): LineChange[] | null {
    const diff = diffArrays(base, splitLines(text), { timeout: 150 });
    if (!diff) return null;
    const changes: LineChange[] = [];
    let offset = 0;
    let current: LineChange | undefined;
    for (const { added, removed, value } of diff) {
        if (!added && !removed) {
            offset += value.length;
            current = undefined;
            continue;
        }
        if (!current) {
            current = { start: offset, end: offset, text: "" };
            changes.push(current);
        }
        if (removed) {
            offset += value.length;
            current.end = offset;
        } else {
            current.text += value.join("");
        }
    }
    return changes;
}

export function mergeWikitext(
    base: string,
    source: string,
    destination: string,
): string | null {
    if (source === destination || source === base) return destination;
    if (destination === base) return source;

    const lines = splitLines(base);
    const sourceChanges = lineChanges(lines, source);
    const destinationChanges = lineChanges(lines, destination);
    if (!sourceChanges || !destinationChanges) return null;

    const changes = [...sourceChanges, ...destinationChanges].sort(
        (a, b) => a.start - b.start || a.end - b.end,
    );
    const merged = [];
    let offset = 0;
    let previous: LineChange | undefined;
    for (const change of changes) {
        if (change.start === previous?.start && change.end === previous.end) {
            if (change.text !== previous.text) return null;
            continue;
        }
        if (change.start < offset) return null;
        merged.push(lines.slice(offset, change.start).join(""), change.text);
        offset = change.end;
        previous = change;
    }
    merged.push(lines.slice(offset).join(""));
    return merged.join("");
}
