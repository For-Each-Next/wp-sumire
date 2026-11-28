const htmlEntities: Readonly<Record<string, string>> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/** Escapes text and quoted attribute values in the article preview. */
export function escapePreviewHtml(value: string): string {
    return value.replace(/[&<>"']/gu, (character) => htmlEntities[character]!);
}
