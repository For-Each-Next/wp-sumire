/**
 * @file src/wpvg-assessor/support/wikitext/source-ranges.ts
 * Purpose: Shared source-interval merging, masking, and replacement.
 *
 * Contents: Source intervals, replacement values, and offset-preserving operations.
 */

export interface SourceRange {
    end: number;
    start: number;
}

export interface SourceReplacement extends SourceRange {
    value: string;
}

/** Sorts source ranges from left to right, with enclosing ranges first. */
export function compareSourceRanges(
    left: SourceRange,
    right: SourceRange,
): number {
    return left.start - right.start || right.end - left.end;
}

/** Combines overlapping or touching intervals without mutating their inputs. */
export function mergeSourceRanges(
    ranges: readonly SourceRange[],
): SourceRange[] {
    const merged: SourceRange[] = [];
    for (const range of ranges.toSorted(compareSourceRanges)) {
        const previous = merged.at(-1);
        if (previous == null || previous.end < range.start) {
            merged.push({ ...range });
            continue;
        }
        previous.end = Math.max(previous.end, range.end);
    }
    return merged;
}

/** Blanks selected source intervals while preserving all source offsets. */
export function maskSourceRanges(
    source: string,
    ranges: readonly SourceRange[],
): string {
    let cursor = 0;
    let masked = "";
    for (const range of mergeSourceRanges(ranges)) {
        masked += source.slice(cursor, range.start);
        masked += " ".repeat(range.end - range.start);
        cursor = range.end;
    }
    return masked + source.slice(cursor);
}

/** Applies non-overlapping edits using their original source offsets. */
export function replaceSourceRanges(
    source: string,
    replacements: readonly SourceReplacement[],
): string {
    let result = source;
    for (const replacement of replacements.toSorted(
        (left, right) => right.start - left.start,
    )) {
        result =
            result.slice(0, replacement.start) +
            replacement.value +
            result.slice(replacement.end);
    }
    return result;
}
