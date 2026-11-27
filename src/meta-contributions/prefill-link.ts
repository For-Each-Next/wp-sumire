import { formatPageTitle } from "./page-title.ts";

export interface PrefillLink {
    site: string;
    title: string;
    fragment: string;
    label: string;
}

const chineseVariants = new Set([
    "zh-hans",
    "zh-hant",
    "zh-cn",
    "zh-hk",
    "zh-mo",
    "zh-my",
    "zh-sg",
    "zh-tw",
]);
const wikipediaSite = /^(?:[a-z]{2,3}(?:-[a-z0-9]+)*|simple)$/u;
const reservedHosts = new Set(["api", "ten", "www"]);
const aliases = new Map([
    ["be-x-old", "be-tarask"],
    ["cz", "cs"],
    ["dk", "da"],
    ["jp", "ja"],
    ["mo", "ro"],
    ["nan", "zh-min-nan"],
    ["nb", "no"],
    ["yue", "zh-yue"],
]);
// Wikimedia Wikipedia database names, with underscores converted to hyphens.
// For a bare prefix, known codes avoid treating a title such as Re:Zero as interwiki.
const shorthandSites = new Set(
    [
        "aa ab ace ady af ak als alt am ami an ang ann anp ar arc ary arz as ast atj av avk awa ay az azb",
        "ba ban bar bat-smg bbc bcl bdr be be-tarask be-x-old bew bg bh bi bjn blk bm bn bo bol bpy br bs btm bug bxr",
        "ca cbk-zam cdo ce ceb ch cho chr chy ckb co cr crh cs csb cu cv cy da dag de dga din diq dsb dtp dty dv dz",
        "ee el eml en eo es et eu ext fa fat ff fi fiu-vro fj fo fon fr frp frr fur fy ga gag gan gcr gd gl glk gn gom gor got gpe gu guc gur guw gv",
        "ha hak haw he hi hif ho hr hsb ht hu hy hyw hz ia iba id ie ig igl ii ik ilo inh io is isv it iu ja jam jbo jv",
        "ka kaa kab kai kaj kbd kbp kcg kg kge ki kj kk kl km kn knc ko koi kr krc ks ksh ku kus kv kw ky",
        "la lad lb lbe lez lfn lg li lij lld lmo ln lo lrc lt ltg lv mad mag mai map-bms mdf mg mh mhr mi min mk ml mn mni mnw mos mr mrj ms mt mus mwl my myv mzn",
        "na nah nap nds nds-nl ne new ng nia nl nn no nov nqo nr nrm nso nup nv ny oc olo om or os pa pag pam pap pcd pcm pdc pfl pi pih pl pms pnb pnt ppl ps pt pwn",
        "qu rki rm rmy rn ro roa-rup roa-tara rsk ru rue rw sa sah sat sc scn sco sd se sg sh shi shn si simple sk skr sl sm smn sn so sq sr srn ss st stq su sv sw syl szl szy",
        "ta tay tcy tdd te tet tg th ti tig tk tl tly tn to tok tpi tr trv ts tt tum tw ty tyv udm ug uk ur uz ve vec vep vi vls vo wa war wo wuu xal xh xmf yi yo za zea zgh zh zh-classical zh-min-nan zh-yue zu",
    ]
        .join(" ")
        .split(" "),
);
const urlLike =
    /^(?:\/\/|[a-z][a-z0-9+.-]*:\/\/|https?:|ftp:|file:\/|mailto:|javascript:|data:|vbscript:|blob:|about:)/iu;
const unsafeMarkup = /[[\]{}<>|\\\u0000-\u001f\u007f-\u009f]/u;

function siteCode(value: string): string | null {
    const code = value.trim().toLowerCase();
    if (chineseVariants.has(code)) return "zh";
    const canonical = aliases.get(code) ?? code;
    return wikipediaSite.test(canonical) && !reservedHosts.has(canonical)
        ? canonical
        : null;
}

function decode(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        return null;
    }
}

function decodedQueryTitle(url: URL): string | null {
    let title: string | null = null;
    for (const argument of url.search.slice(1).split("&")) {
        const equals = argument.indexOf("=");
        const key = equals < 0 ? argument : argument.slice(0, equals);
        if (decode(key.replaceAll("+", " ")) !== "title") continue;
        if (equals < 0 || title !== null) return null;
        title = decode(argument.slice(equals + 1).replaceAll("+", " "));
        if (title === null) return null;
    }
    return title;
}

function result(
    site: string,
    source: string,
    label: string,
    urlFragment?: string,
): PrefillLink | null {
    if (unsafeMarkup.test(source) || unsafeMarkup.test(label)) return null;
    const target = source.trim().replace(/^:\s*/u, "");
    const hash = target.indexOf("#");
    const title = formatPageTitle(
        hash === -1 ? target : target.slice(0, hash),
    ).trim();
    const fragment =
        urlFragment ?? (hash === -1 ? "" : target.slice(hash + 1));
    if (
        !title ||
        title.startsWith(":") ||
        urlLike.test(title) ||
        /'{2,}|^={2,}.*={2,}$/u.test(title) ||
        unsafeMarkup.test(fragment)
    )
        return null;
    return { site, title, fragment, label };
}

function parseUrl(text: string): PrefillLink | null {
    if (!/^https:\/\//iu.test(text) || text.includes("\\")) return null;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return null;
    }
    const host = /^([a-z][a-z0-9-]*)\.(?:m\.)?wikipedia\.org$/u.exec(
        url.hostname,
    );
    if (!host || url.username || url.password || url.port) return null;
    const site = siteCode(host[1]);
    if (!site) return null;

    let title: string | null;
    if (url.pathname === "/w/index.php") {
        title = decodedQueryTitle(url);
    } else {
        const path = /^\/([^/]+)\/(.+)$/u.exec(url.pathname);
        const variantPath =
            path &&
            site === "zh" &&
            (path[1] === "zh" || chineseVariants.has(path[1]));
        if (!path || (path[1] !== "wiki" && !variantPath)) return null;
        title = decode(path[2]);
    }
    const fragment = url.hash ? decode(url.hash.slice(1)) : undefined;
    if (title === null || fragment === null) return null;
    return result(site, title, "", fragment);
}

export function parsePrefillLink(
    input: string,
    defaultSite: string,
): PrefillLink | null {
    const text = input.trim();
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(text)) return null;
    if (urlLike.test(text)) return parseUrl(text);

    let target = text;
    let label = "";
    if (text.startsWith("[[") && text.endsWith("]]")) {
        const parts = text.slice(2, -2).split("|");
        if (parts.length > 2) return null;
        target = parts[0]
            .trim()
            .replace(
                /(?:%[\da-f]{2})+/giu,
                (encoded) => decode(encoded) ?? encoded,
            );
        label = parts[1]?.trim() ?? "";
    }
    target = target.replace(/^:\s*/u, "");
    if (unsafeMarkup.test(target) || urlLike.test(target)) return null;

    const project = /^(w|wikipedia):\s*/iu.exec(target);
    const page = project ? target.slice(project[0].length) : target;
    const prefix = /^([a-z][a-z0-9-]*)\s*:\s*/iu.exec(page);
    if (prefix) {
        const code = prefix[1].toLowerCase();
        if (
            shorthandSites.has(code) ||
            aliases.has(code) ||
            chineseVariants.has(code)
        ) {
            const site = siteCode(code);
            return site
                ? result(site, page.slice(prefix[0].length), label)
                : null;
        }
    }
    // On Meta, w: alone points to English Wikipedia. A full Wikipedia: title
    // is also a local project-namespace title, so keep that prefix by default.
    if (project?.[1].toLowerCase() === "w") return result("en", page, label);
    const site = siteCode(defaultSite);
    return site ? result(site, target, label) : null;
}
