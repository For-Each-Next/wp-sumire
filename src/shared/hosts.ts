const chineseWikipedia = "zh.wikipedia.org";
export const draftHosts = [chineseWikipedia, "zh.m.wikipedia.org"];
export const assessorWikiOrigin = `https://${chineseWikipedia}`;
export const assessorPetScanHosts = [
    "petscan.toolforge.org",
    "petscan.wmcloud.org",
];
export const assessorHosts = [chineseWikipedia, ...assessorPetScanHosts];
export const reviewApexHosts = ["metacritic.com", "opencritic.com"] as const;
export const reviewHosts = reviewApexHosts.flatMap((host) => [
    host,
    `www.${host}`,
]);

const projectFamilies = [
    "wikipedia.org",
    "wikibooks.org",
    "wikinews.org",
    "wikiquote.org",
    "wikisource.org",
    "wikiversity.org",
    "wikivoyage.org",
    "wiktionary.org",
];
const projectHosts = [
    "commons.wikimedia.org",
    "commons.m.wikimedia.org",
    "foundation.wikimedia.org",
    "foundation.m.wikimedia.org",
    "incubator.wikimedia.org",
    "incubator.m.wikimedia.org",
    "meta.wikimedia.org",
    "meta.m.wikimedia.org",
    "outreach.wikimedia.org",
    "outreach.m.wikimedia.org",
    "species.wikimedia.org",
    "species.m.wikimedia.org",
    "wikimania.wikimedia.org",
    "wikimania.m.wikimedia.org",
    "www.wikidata.org",
    "m.wikidata.org",
    "www.wikifunctions.org",
    "www.mediawiki.org",
    "m.mediawiki.org",
];
const excludedHosts = [
    // Multilingual Wikisource is served from its apex domain.
    ...projectFamilies.filter((host) => host !== "wikisource.org"),
    ...projectFamilies.map((host) => `www.${host}`),
    "api.wikipedia.org",
    "nostalgia.wikipedia.org",
    "ten.wikipedia.org",
    "thankyou.wikipedia.org",
    "wg-en.wikipedia.org",
];
const excludedWikipediaPrefixes = ["test", "arbcom-", "sysop-"];

export const wikiHosts = [
    ...projectFamilies.map((host) => `*.${host}`),
    ...projectHosts,
];
export const wikiExclusions = [
    ...excludedHosts,
    ...excludedWikipediaPrefixes.map((prefix) => `${prefix}*.wikipedia.org`),
];

export function isWikimediaUrl({
    protocol,
    hostname,
}: Pick<Location, "protocol" | "hostname">): boolean {
    if (protocol !== "https:" || excludedHosts.includes(hostname)) {
        return false;
    }
    if (
        hostname.endsWith(".wikipedia.org") &&
        excludedWikipediaPrefixes.some((prefix) => hostname.startsWith(prefix))
    ) {
        return false;
    }
    return (
        projectHosts.includes(hostname) ||
        projectFamilies.some(
            (host) => hostname === host || hostname.endsWith(`.${host}`),
        )
    );
}
