import {
    scanWikitext,
    visitWikitext,
    type Span,
    type WikitextElement,
} from "../shared/wikitext-scan.ts";

export type NamespaceIds = Readonly<Record<string, number>>;

export interface FileReference extends Span {
    title: string;
}

interface Edit extends Span {
    text: string;
}

const canonicalNamespaces: NamespaceIds = {
    file: 6,
    image: 6,
    template: 10,
    category: 14,
};
const draftCategoriesTemplates = new Set(["draft categories", "dcat"]);
const draftOnlyTemplates = new Set(["draft", "todo", "section sizes"]);
const draftSectionSizes = "{{Section sizes|bytes_heatmap=ignore_appendices}}";
const commentStart = "<!-- ";
const commentEnd = " // 根據[[WP:NFCC#9]]無效化檔案 -->";
const commentPattern = /<!--[\s\S]*?-->/g;
const fileExtension =
    /\.(?:jpe?g|png|gif|svg|webp|avif|tiff?|bmp|ico|xcf|og[agv]|opus|flac|wav|mp[34]|mpe?g|webm|mid[i]?|pdf|djvu|stl)$/i;
const fileField =
    /(?:^|[ _-])(?:image|picture|pic|photo|file|logo|cover|flag|map|seal|signature|portrait|screenshot|emblem|shield|insignia|icon|sound|audio|video)\d*(?=$|[ _-])|^(?:圖片|图片|圖像|图像|影像|圖檔|图档|照片|相片|圖標|图标|標誌|标志|徽標|徽标|旗幟|旗帜|地圖|地图|簽名|签名|封面|音訊|音频|影片|視頻|视频)(?:檔案|档案|文件|[ _-]*\d+)?$/i;
const otherField =
    /(?:^|[ _-])(?:alt|caption|description|text|size|height|width|upright|scale|position|class|style|link|url|source|date)\d*(?=$|[ _-])/i;
const positionalMediaTemplates = new Set([
    "audio",
    "video",
    "sound",
    "listen",
]);

function namespacePrefix(
    text: string,
    namespaceIds: NamespaceIds,
): number | undefined {
    const colon = text.indexOf(":");
    if (colon < 1) {
        return undefined;
    }
    const prefix = text
        .slice(0, colon)
        .trim()
        .replace(/[ _]+/g, "_")
        .toLowerCase();
    return namespaceIds[prefix] ?? canonicalNamespaces[prefix];
}

function partText(source: string, part: Span): string {
    return source
        .slice(part.start, part.end)
        .replace(commentPattern, "")
        .trim();
}

function templateName(
    source: string,
    node: WikitextElement,
    namespaceIds: NamespaceIds,
): string {
    let name = partText(source, node.parts[0]);
    if (namespacePrefix(name, namespaceIds) === 10) {
        name = name.slice(name.indexOf(":") + 1).trim();
    }
    return name.replace(/[\s_]+/g, " ").toLowerCase();
}

function fileTitle(
    text: string,
    namespaceIds: NamespaceIds,
    allowBare = false,
): string | null {
    const prefix = namespacePrefix(text, namespaceIds);
    let title;
    if (prefix === 6) {
        title = text.slice(text.indexOf(":") + 1).trim();
    } else if (
        allowBare &&
        !text.includes(":") &&
        !text.startsWith("//") &&
        fileExtension.test(text)
    ) {
        title = text;
    }
    if (!title || /[\x00-\x1f[\]{}<>|#]/.test(title)) {
        return null;
    }
    return title;
}

function maskComments(text: string): string {
    return text.replace(commentPattern, (comment) =>
        comment.replace(/[^\r\n]/g, " "),
    );
}

function trimmedSpan(text: string, offset: number): Span {
    return {
        start: offset + text.length - text.trimStart().length,
        end: offset + text.trimEnd().length,
    };
}

function templateFileReferences(
    source: string,
    node: WikitextElement,
    namespaceIds: NamespaceIds,
): FileReference[] {
    const references: FileReference[] = [];
    const allowFirstPosition = positionalMediaTemplates.has(
        templateName(source, node, namespaceIds),
    );
    for (let index = 1; index < node.parts.length; index++) {
        const { start, end, equals } = node.parts[index];
        const field =
            equals === undefined
                ? ""
                : partText(source, { start, end: equals });
        const valueStart = equals === undefined ? start : equals + 1;
        const value = source.slice(valueStart, end);
        const allowBare =
            (allowFirstPosition &&
                (field === "1" || (!field && index === 1))) ||
            (fileField.test(field) && !otherField.test(field));
        const title = fileTitle(
            value.replace(commentPattern, "").trim(),
            namespaceIds,
            allowBare,
        );
        if (title) {
            references.push({
                ...trimmedSpan(maskComments(value), valueStart),
                title,
            });
        }
    }
    return references;
}

function mediaTagReferences(
    source: string,
    node: WikitextElement,
    namespaceIds: NamespaceIds,
): FileReference[] {
    const body = source.slice(node.openEnd, node.closeStart);
    const gallery = node.kind === "gallery";
    const references: FileReference[] = [];
    for (const match of maskComments(body).matchAll(/[^\r\n]+/g)) {
        const line = match[0];
        const visible = line.trim();
        if (!visible || (!gallery && visible.startsWith("#"))) {
            continue;
        }
        const pipe = line.indexOf("|");
        const nameEnd =
            pipe === -1 ? match.index + line.length : match.index + pipe;
        const name = body
            .slice(match.index, nameEnd)
            .replace(commentPattern, "")
            .trim();
        const title = fileTitle(name, namespaceIds, gallery);
        if (gallery) {
            if (title) {
                references.push({
                    ...trimmedSpan(line, node.openEnd + match.index),
                    title,
                });
            }
        } else {
            // The ImageMap extension requires the image declaration. Disable
            // the whole map together with the file instead of leaving an error.
            return title ? [{ start: node.start, end: node.end, title }] : [];
        }
    }
    return references;
}

function sourceOrder(a: Span, b: Span): number {
    return a.start - b.start || b.end - a.end;
}

export function findFileReferences(
    source: string,
    namespaceIds: NamespaceIds = {},
): FileReference[] {
    const references: FileReference[] = [];
    visitWikitext(scanWikitext(source), (node) => {
        if (node.kind === "link") {
            const title = fileTitle(
                partText(source, node.parts[0]),
                namespaceIds,
            );
            if (title) {
                references.push({ start: node.start, end: node.end, title });
            }
        } else if (node.kind === "template") {
            references.push(
                ...templateFileReferences(source, node, namespaceIds),
            );
        } else if (node.kind === "gallery" || node.kind === "imagemap") {
            references.push(...mediaTagReferences(source, node, namespaceIds));
        }
    });
    return references.sort(sourceOrder);
}

function applyEdits(source: string, edits: Edit[]): string {
    const output = [];
    let offset = 0;
    for (const { start, end, text } of edits.sort(sourceOrder)) {
        // A disabled image can contain more file references in its caption.
        if (start < offset) {
            continue;
        }
        output.push(source.slice(offset, start), text);
        offset = end;
    }
    output.push(source.slice(offset));
    return output.join("");
}

function disableFile(wikitext: string): string {
    // Shield existing escape sequences before escaping comment delimiters.
    // Replacing the two delimiters separately also handles literal <!-->.
    const escaped = wikitext
        .replace(/&(?=amp;|lt;!--|gt;)/g, "&amp;")
        .replace(/<(?=!--)/g, "&lt;")
        .replace(/-->/g, "--&gt;");
    return commentStart + escaped + commentEnd;
}

function wrapCategories(source: string, namespaceIds: NamespaceIds): string {
    const blocks: Span[] = [];
    visitWikitext(scanWikitext(source), (node) => {
        if (
            node.kind === "template" &&
            draftCategoriesTemplates.has(
                templateName(source, node, namespaceIds),
            )
        ) {
            return false;
        }
        if (
            node.kind === "link" &&
            namespacePrefix(partText(source, node.parts[0]), namespaceIds) ===
                14
        ) {
            const previous = blocks[blocks.length - 1];
            if (
                previous &&
                /^\s*$/.test(source.slice(previous.end, node.start))
            ) {
                previous.end = node.end;
            } else {
                blocks.push({ start: node.start, end: node.end });
            }
            return false;
        }
    });
    return applyEdits(
        source,
        blocks.map(({ start, end }) => ({
            start,
            end,
            text: `{{Draft categories|${source.slice(start, end)}}}`,
        })),
    );
}

export function mirrorToDraft(
    source: string,
    articleName: string,
    localReferences: readonly FileReference[],
    namespaceIds: NamespaceIds = {},
): string {
    const body = applyEdits(
        source,
        localReferences.map(({ start, end }) => ({
            start,
            end,
            text: disableFile(source.slice(start, end)),
        })),
    );
    const newline = source.match(/\r\n|\r|\n/)?.[0] ?? "\n";
    const titleParameter = articleName.includes("=")
        ? `1=${articleName}`
        : articleName;
    return (
        `{{Draft|${titleParameter}}}${newline}{{Todo|inner=${newline}}}${newline}${draftSectionSizes}` +
        newline +
        newline +
        wrapCategories(body, namespaceIds)
    );
}

function draftTemplateEdits(
    source: string,
    templates: WikitextElement[],
): Edit[] {
    const edits: (Edit & { wholeLine: boolean })[] = [];
    for (const node of templates) {
        const lineStart =
            Math.max(
                source.lastIndexOf("\n", node.start - 1),
                source.lastIndexOf("\r", node.start - 1),
            ) + 1;
        const trailing = /^[ \t]*(?:\r\n|\r|\n|$)/.exec(
            source.slice(node.end),
        );
        const wholeLine = Boolean(
            trailing && /^[ \t]*$/.test(source.slice(lineStart, node.start)),
        );
        const start = wholeLine ? lineStart : node.start;
        const end = wholeLine ? node.end + trailing![0].length : node.end;
        const previous = edits[edits.length - 1];
        if (
            wholeLine &&
            previous?.wholeLine &&
            /^\s*$/.test(source.slice(previous.end, start))
        ) {
            previous.end = end;
        } else {
            edits.push({ start, end, text: "", wholeLine });
        }
    }

    for (const edit of edits) {
        if (!edit.wholeLine) continue;
        const before = source.slice(0, edit.start);
        if (/^\s*$/.test(before)) edit.start = 0;
        let previousLineEnd = edit.start;
        if (source[previousLineEnd - 1] === "\n") previousLineEnd--;
        if (source[previousLineEnd - 1] === "\r") previousLineEnd--;
        const previousLineStart =
            Math.max(
                source.lastIndexOf("\n", previousLineEnd - 1),
                source.lastIndexOf("\r", previousLineEnd - 1),
            ) + 1;
        const previousLineBlank = /^[ \t]*$/.test(
            source.slice(previousLineStart, previousLineEnd),
        );
        // Keep a single paragraph break around a removed block, while avoiding
        // an extra blank line where the draft heading preceded the article.
        if (edit.start === 0 || previousLineBlank) {
            edit.end +=
                /^[ \t]*(?:\r\n|\r|\n)/.exec(source.slice(edit.end))?.[0]
                    .length ?? 0;
        }
    }
    return edits;
}

function categoryParameter(source: string, node: WikitextElement): Span {
    let anonymousSeen = false;
    let parameter: Span | undefined;
    for (const { start, end, equals } of node.parts.slice(1)) {
        if (equals === undefined && !anonymousSeen) {
            parameter = { start, end };
            anonymousSeen = true;
        } else if (
            equals !== undefined &&
            partText(source, { start, end: equals }) === "1"
        ) {
            parameter = { start: equals + 1, end };
        }
    }
    if (!parameter) {
        return { start: node.end, end: node.end };
    }
    const value = source.slice(parameter.start, parameter.end);
    const leading = /^[ \t]*(?:\r\n|\r|\n)/.exec(value)?.[0].length ?? 0;
    const trailing = /(?:\r\n|\r|\n)[ \t]*$/.exec(value)?.[0].length ?? 0;
    return {
        start: parameter.start + leading,
        end: Math.max(parameter.start + leading, parameter.end - trailing),
    };
}

function unwrapCategories(
    source: string,
    node: WikitextElement,
    namespaceIds: NamespaceIds,
): Edit[] {
    const { start, end } = categoryParameter(source, node);
    const edits: Edit[] = [
        { start: node.start, end: start, text: "" },
        { start: end, end: node.end, text: "" },
    ];
    // The Draft categories template interprets leading-colon category links
    // in its argument as category membership when rendered in mainspace.
    for (const child of node.children) {
        if (
            child.kind === "link" &&
            child.start >= start &&
            child.end <= end &&
            source[child.openEnd] === ":"
        ) {
            const target = partText(source, child.parts[0]).slice(1);
            if (namespacePrefix(target, namespaceIds) === 14) {
                edits.push({
                    start: child.openEnd,
                    end: child.openEnd + 1,
                    text: "",
                });
            }
        }
    }
    return edits;
}

const commentEscapes: Readonly<Record<string, string>> = {
    "&amp;": "&",
    "&lt;": "<",
    "--&gt;": "-->",
};

function restoredFileComment(
    comment: string,
    namespaceIds: NamespaceIds,
): string | null {
    if (!comment.startsWith(commentStart) || !comment.endsWith(commentEnd)) {
        return null;
    }
    const value = comment
        .slice(commentStart.length, -commentEnd.length)
        .replace(
            /&amp;|&lt;(?=!--)|--&gt;/g,
            (escape) => commentEscapes[escape],
        );
    const trimmed = value.trim();
    const title = fileTitle(
        trimmed.split("|", 1)[0].replace(commentPattern, "").trim(),
        namespaceIds,
        true,
    );
    if (title) {
        return value;
    }
    const reference = findFileReferences(trimmed, namespaceIds)[0];
    return reference?.start === 0 && reference.end === trimmed.length
        ? value
        : null;
}

export function publishDraft(
    source: string,
    namespaceIds: NamespaceIds = {},
): string {
    const nodes = scanWikitext(source);
    const templates = nodes.filter(
        (node): node is WikitextElement =>
            node.kind === "template" &&
            draftOnlyTemplates.has(templateName(source, node, namespaceIds)),
    );
    const removedTemplates = new Set(templates);
    const edits = draftTemplateEdits(source, templates);
    visitWikitext(nodes, (node) => {
        if (node.kind === "template" && removedTemplates.has(node)) {
            return false;
        } else if (
            node.kind === "template" &&
            draftCategoriesTemplates.has(
                templateName(source, node, namespaceIds),
            )
        ) {
            edits.push(...unwrapCategories(source, node, namespaceIds));
        } else if (node.kind === "comment") {
            const text = restoredFileComment(
                source.slice(node.start, node.end),
                namespaceIds,
            );
            if (text !== null) {
                edits.push({ start: node.start, end: node.end, text });
            }
        }
    });
    return applyEdits(source, edits);
}
