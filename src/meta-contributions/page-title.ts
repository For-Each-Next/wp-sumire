const namespaceAliases: Record<string, number> = {
    talk: 1,
    讨论: 1,
    討論: 1,
    对话: 1,
    對話: 1,
    ノート: 1,
    user: 2,
    用户: 2,
    用戶: 2,
    使用者: 2,
    利用者: 2,
    "user talk": 3,
    用户讨论: 3,
    使用者討論: 3,
    "利用者‐会話": 3,
    wikipedia: 4,
    project: 4,
    wp: 4,
    维基百科: 4,
    維基百科: 4,
    "wikipedia talk": 5,
    "project talk": 5,
    wt: 5,
    维基百科讨论: 5,
    維基百科討論: 5,
    draft: 118,
    草稿: 118,
    "draft talk": 119,
    草稿讨论: 119,
    草稿討論: 119,
};

export function withoutNamespace(title: string): string {
    return title.slice(title.indexOf(":") + 1).trim();
}

export function knownNamespace(title: string): number | undefined {
    const colon = title.indexOf(":");
    if (colon < 0) return undefined;
    const prefix = title.slice(0, colon).trim().toLowerCase();
    const id = namespaceAliases[prefix];
    return typeof id === "number" ? id : undefined;
}

export function formatPageTitle(value: string): string {
    const anchor = value.indexOf("#");
    if (anchor === -1) return value.replaceAll("_", " ");
    return value.slice(0, anchor).replaceAll("_", " ") + value.slice(anchor);
}

export function formatEntryName(value: string): string {
    const title = formatPageTitle(value.split("#", 1)[0]).trim();
    return knownNamespace(title) === undefined
        ? title
        : withoutNamespace(title);
}
