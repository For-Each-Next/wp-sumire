import { META_ORIGIN, MetaContributionsError } from "./meta-api.ts";
import { profileHeadings, type ProfileSectionId } from "./profile-records.ts";

const headingSelector = "h1, h2, h3, h4, h5, h6";
const imageOrigins = [
    "https://upload.wikimedia.org",
    "https://thumb.wikimedia.org",
];
const reservedElements = [
    "script",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "applet",
    "portal",
    "fencedframe",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "audio",
    "video",
    "source",
    "track",
    "meta",
    "base",
    "link",
    "style",
    "template",
    "noscript",
].join(", ");
const discardedAttributes = new Set([
    "href",
    "xlink:href",
    "ping",
    "srcdoc",
    "srcset",
    "background",
    "autofocus",
    "tabindex",
    "contenteditable",
]);
const previewPolicy = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imageOrigins.join(" ")} data:`,
    "base-uri 'none'",
    "form-action 'none'",
].join("; ");
const previewStyles = `
html { color-scheme: light dark; color: CanvasText; background: Canvas; }
body { margin: 0; padding: 1rem; font: .95rem/1.5 system-ui, sans-serif; overflow-wrap: anywhere; }
.mw-parser-output a { color: LinkText; }
.mw-parser-output img { max-width: 100%; height: auto; }
.mw-parser-output :is(h2, h3) { margin: .9em 0 .4em; line-height: 1.3; }
`;
const itemPreviewStyles = `
body { padding: .5rem; font-size: .875rem; }
.mw-parser-output .profile > :first-child { margin-block-start: 0; }
.mw-parser-output .profile > :last-child { margin-block-end: 0; }
`;

function headingBoundary(heading: HTMLHeadingElement): Element {
    const wrapper = heading.parentElement?.classList.contains("mw-heading")
        ? heading.parentElement
        : heading;
    const section = wrapper.parentElement;
    return section?.matches("section[data-mw-section-id]") &&
        section.firstElementChild === wrapper
        ? section
        : wrapper;
}

function retainAncestors(
    content: Node,
    root: HTMLElement,
    start: Node | null,
): Node {
    // TemplateStyles selectors can include a project-specific wrapper around
    // the content. Retain that ancestor chain without copying its siblings.
    for (
        let ancestor = start;
        ancestor && ancestor !== root && ancestor.parentElement;
        ancestor = ancestor.parentElement
    ) {
        const shell = ancestor.cloneNode(false) as Element;
        shell.append(content);
        content = shell;
    }
    return content;
}

function cloneSection(
    root: HTMLElement,
    heading: HTMLHeadingElement,
    next?: HTMLHeadingElement,
): Node {
    const range = root.ownerDocument.createRange();
    range.setStartBefore(headingBoundary(heading));
    if (next) range.setEndBefore(headingBoundary(next));
    else range.setEnd(root, root.childNodes.length);
    return retainAncestors(
        range.cloneContents(),
        root,
        range.commonAncestorContainer,
    );
}

function outputWrapper(root: HTMLElement): HTMLElement {
    const fragment = root.ownerDocument.createElement("div");
    for (const name of ["class", "dir", "lang"]) {
        const value = root.getAttribute(name);
        if (value !== null) fragment.setAttribute(name, value);
    }
    fragment.classList.add("mw-parser-output");
    return fragment;
}

function extractSections(
    root: HTMLElement,
    sections: readonly ProfileSectionId[],
): HTMLElement {
    const fragment = outputWrapper(root);
    const selected = new Set(sections);
    if (selected.delete("userboxes")) {
        const list = root.querySelector(".profile-userbox-list");
        if (!list) throw new MetaContributionsError("previewFailed");
        fragment.append(
            retainAncestors(list.cloneNode(true), root, list.parentElement),
        );
    }

    const headings = Array.from(
        root.querySelectorAll<HTMLHeadingElement>(headingSelector),
    );
    const indices = Array.from(selected, (id) => {
        const name = profileHeadings[id];
        const anchored = headings.findIndex(
            (heading) =>
                heading.id === name || heading.querySelector(`#${name}`),
        );
        const index =
            anchored >= 0
                ? anchored
                : headings.findIndex(
                      (heading) => heading.textContent.trim() === name,
                  );
        if (index < 0) throw new MetaContributionsError("previewFailed");
        return index;
    }).sort((a, b) => a - b);
    for (const index of indices) {
        const heading = headings[index];
        const level = Number(heading.tagName[1]);
        const next = headings
            .slice(index + 1)
            .find((candidate) => Number(candidate.tagName[1]) <= level);
        fragment.append(cloneSection(root, heading, next));
    }
    return fragment;
}

function allowedImageSource(src: string): string | null {
    if (/^data:image\//iu.test(src)) return src;
    try {
        const url = new URL(src, META_ORIGIN);
        return url.protocol === "https:" &&
            imageOrigins.includes(url.origin) &&
            !url.username &&
            !url.password
            ? url.href
            : null;
    } catch {
        return null;
    }
}

function restrictMarkup(content: HTMLElement): void {
    for (const element of Array.from(
        content.querySelectorAll(reservedElements),
    ))
        element.remove();
    for (const element of [
        content,
        ...Array.from(content.querySelectorAll("*")),
    ]) {
        for (const { name } of Array.from(element.attributes)) {
            if (name.startsWith("on") || discardedAttributes.has(name)) {
                element.removeAttribute(name);
            }
        }
        if (element.tagName !== "IMG") {
            element.removeAttribute("src");
            continue;
        }
        const src = allowedImageSource(element.getAttribute("src") ?? "");
        if (src) element.setAttribute("src", src);
        else element.removeAttribute("src");
    }
}

function parsePreviewMarkup(document: Document, html: string) {
    const view = document.defaultView as (Window & typeof globalThis) | null;
    const Parser = view?.DOMParser ?? DOMParser;
    const parsed = new Parser().parseFromString(html, "text/html");
    const root =
        parsed.body.querySelector<HTMLElement>(".mw-parser-output") ??
        parsed.body;
    return { parsed, root };
}

function serializePreviewDocument(
    document: Document,
    parsed: Document,
    content: HTMLElement,
    styles: string,
): string {
    restrictMarkup(content);

    const preview = document.implementation.createHTMLDocument();
    const charset = preview.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    const csp = preview.createElement("meta");
    csp.httpEquiv = "Content-Security-Policy";
    csp.content = previewPolicy;
    const referrer = preview.createElement("meta");
    referrer.name = "referrer";
    referrer.content = "no-referrer";
    const style = preview.createElement("style");
    style.textContent = styles;
    const templateStyles = Array.from(
        parsed.querySelectorAll(
            'style[data-mw-deduplicate^="TemplateStyles:"]',
        ),
        (source) => {
            const stylesheet = preview.createElement("style");
            stylesheet.textContent = source.textContent;
            return stylesheet;
        },
    );
    preview.head.replaceChildren(
        charset,
        csp,
        referrer,
        style,
        ...templateStyles,
    );
    preview.documentElement.lang = document.documentElement.lang || "en";
    if (
        document.documentElement.classList.contains(
            "skin-theme-clientpref-night",
        )
    ) {
        preview.documentElement.style.colorScheme = "dark";
    } else if (
        document.documentElement.classList.contains(
            "skin-theme-clientpref-day",
        )
    ) {
        preview.documentElement.style.colorScheme = "light";
    }
    preview.body.append(content);
    return "<!doctype html>" + preview.documentElement.outerHTML;
}

export function preparePreviewDocument(
    document: Document,
    html: string,
    sections: readonly ProfileSectionId[] = ["contributions"],
): string {
    const { parsed, root } = parsePreviewMarkup(document, html);
    return serializePreviewDocument(
        document,
        parsed,
        extractSections(root, sections),
        previewStyles,
    );
}

export function prepareItemPreviewDocument(
    document: Document,
    html: string,
): string {
    const { parsed, root } = parsePreviewMarkup(document, html);
    const content = outputWrapper(root);
    for (const child of Array.from(root.childNodes))
        content.append(child.cloneNode(true));
    return serializePreviewDocument(
        document,
        parsed,
        content,
        previewStyles + itemPreviewStyles,
    );
}
