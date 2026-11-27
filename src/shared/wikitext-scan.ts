const literalTags = new Set([
    "nowiki",
    "pre",
    "source",
    "syntaxhighlight",
    "math",
    "chem",
    "templatedata",
    "score",
    "timeline",
    "hiero",
    "graph",
    "mapframe",
    "maplink",
    "inputbox",
]);
const parsedTags = [
    "gallery",
    "imagemap",
    "ref",
    "references",
    "poem",
    "indicator",
] as const;

export interface Span {
    start: number;
    end: number;
}

interface TemplatePart extends Span {
    equals?: number;
}

type FrameKind =
    | (typeof parsedTags)[number]
    | "document"
    | "template"
    | "link"
    | "parameter"
    | "external-link"
    | "language-converter";

interface Frame {
    kind: FrameKind;
    start: number;
    openEnd: number;
    close?: string;
    parts: TemplatePart[];
    children: WikitextNode[];
}

export interface WikitextElement extends Frame, Span {
    closeStart: number;
}

export type WikitextNode =
    WikitextElement | ({ kind: "comment" | "literal" } & Span);

// Nodes store source offsets. Each template or wikilink part records only its
// own delimiters, so pipes and equals signs inside nested markup stay intact.
export function scanWikitext(source: string): WikitextNode[] {
    const stack: Frame[] = [
        { kind: "document", start: 0, openEnd: 0, parts: [], children: [] },
    ];
    const tagPattern =
        /<(\/?)([a-z][\w:-]*)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^"'<>])*>/iy;
    const tokenPattern = /[<[\]{}|=]|-\{/g;
    const externalLink =
        /\[(?:\/\/|(?:https?|ftp|ftps|mailto|news|irc|ircs):)/iy;
    let token: RegExpExecArray | null;

    function open(
        kind: FrameKind,
        start: number,
        openEnd: number,
        close?: string,
    ) {
        const parts =
            kind === "template" || kind === "link"
                ? [{ start: openEnd, end: openEnd }]
                : [];
        stack.push({ kind, start, openEnd, close, parts, children: [] });
        tokenPattern.lastIndex = openEnd;
    }

    function finish(index: number, closeStart: number, end: number) {
        const frame = stack[index];
        // A closing extension tag also terminates any incomplete markup in
        // its body. Retain the balanced children found inside that markup.
        for (let level = index + 1; level < stack.length; level++) {
            for (const child of stack[level].children) {
                frame.children.push(child);
            }
        }
        const lastPart = frame.parts[frame.parts.length - 1];
        if (lastPart) {
            lastPart.end = closeStart;
        }
        stack.length = index;
        stack[index - 1].children.push({ ...frame, closeStart, end });
        tokenPattern.lastIndex = end;
    }

    while ((token = tokenPattern.exec(source))) {
        const start = token.index;
        const symbol = token[0];
        const current = stack[stack.length - 1];
        if (current.close && source.startsWith(current.close, start)) {
            finish(stack.length - 1, start, start + current.close.length);
        } else if (source.startsWith("<!--", start)) {
            const close = source.indexOf("-->", start + 4);
            if (close === -1) {
                break;
            }
            const end = close + 3;
            current.children.push({ kind: "comment", start, end });
            tokenPattern.lastIndex = end;
        } else if (symbol === "<") {
            tagPattern.lastIndex = start;
            const match = tagPattern.exec(source);
            if (!match) {
                continue;
            }
            const [tagText, closing, tagName] = match;
            const tag = tagName.toLowerCase();
            const parsedTag = parsedTags.find((name) => name === tag);
            const openEnd = tagPattern.lastIndex;
            tokenPattern.lastIndex = openEnd;
            if (closing && parsedTag) {
                let index = stack.length - 1;
                while (index > 0 && stack[index].kind !== parsedTag) {
                    index--;
                }
                if (index > 0) {
                    finish(index, start, openEnd);
                }
            } else if (!closing && !tagText.endsWith("/>")) {
                if (literalTags.has(tag)) {
                    const endTag = new RegExp(`</${tag}\\s*>`, "gi");
                    endTag.lastIndex = openEnd;
                    const close = endTag.exec(source);
                    const end = close ? endTag.lastIndex : source.length;
                    current.children.push({ kind: "literal", start, end });
                    tokenPattern.lastIndex = end;
                } else if (parsedTag) {
                    open(parsedTag, start, openEnd);
                }
            }
        } else if (symbol === "{" && source[start + 1] === "{") {
            // A run of four braces starts two templates. Leave its inner
            // braces for the next pass so runs of five can start a parameter.
            if (source[start + 2] === "{" && source[start + 3] !== "{") {
                open("parameter", start, start + 3, "}}}");
            } else {
                open("template", start, start + 2, "}}");
            }
        } else if (symbol === "[") {
            externalLink.lastIndex = start;
            if (source[start + 1] === "[") {
                open("link", start, start + 2, "]]");
            } else if (externalLink.test(source)) {
                open("external-link", start, start + 1, "]");
            }
        } else if (symbol === "-{") {
            open("language-converter", start, start + 2, "}-");
        } else if (symbol === "|" && current.parts.length) {
            current.parts[current.parts.length - 1].end = start;
            current.parts.push({ start: start + 1, end: start + 1 });
        } else if (symbol === "=" && current.kind === "template") {
            const part = current.parts[current.parts.length - 1];
            if (part.equals === undefined) {
                part.equals = start;
            }
        }
    }

    return stack.flatMap(({ children }) => children);
}

export function visitWikitext(
    nodes: WikitextNode[],
    visit: (node: WikitextNode) => void | false,
) {
    const pending = nodes.slice().reverse();
    while (pending.length) {
        const node = pending.pop();
        if (!node || visit(node) === false) {
            continue;
        }
        if ("children" in node) {
            for (let index = node.children.length - 1; index >= 0; index--) {
                pending.push(node.children[index]);
            }
        }
    }
}
