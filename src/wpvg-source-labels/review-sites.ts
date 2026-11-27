import { reviewApexHosts } from "../shared/hosts.ts";
import { httpUrl, normalizeHost } from "./source-table.ts";

const sites = {
    "metacritic.com": {
        route: /^\/game\/[^/]+\/critic-reviews\/?$/u,
        outlet: /^\/publication\/([^/]+)\/?$/u,
        outletPath: "/publication/",
        cards: '[data-testid="review-card"],.c-siteReview',
        header: '[data-testid="review-card-header"],.c-siteReview_header',
        score: '.c-siteReviewScore_background,.c-siteReviewScore,[data-testid*="score"],[aria-label^="Metascore"],[title^="Metascore"]',
    },
    "opencritic.com": {
        route: /^\/game\/\d+\/[^/]+\/reviews\/?$/u,
        outlet: /^\/outlet\/(\d+)(?:\/[^/]+)?\/?$/u,
        outletPath: "/outlet/",
        cards: "app-review-row,.review-row,app-review-card",
        header: ".outlet-name",
        score: "",
    },
} as const;
export type ReviewSite = keyof typeof sites;
const OWNED_UI = "[data-wpvg-owned]";
const outsideReviews = "aside,nav,footer," + OWNED_UI;
const reviewLabel = /^(?:read\s+)?(?:the\s+)?full\s+review\b/iu;

export interface Review {
    container: Element;
    anchor: HTMLAnchorElement;
    name: string;
    urls: string[];
}

type Outlet = Pick<Review, "name" | "anchor"> & { key: string };

export function reviewSite(hostname: string): ReviewSite | null {
    return (
        reviewApexHosts.find(
            (host) => hostname === host || hostname === `www.${host}`,
        ) ?? null
    );
}

export function isReviewPage(site: ReviewSite, pathname: string): boolean {
    return sites[site].route.test(pathname);
}

function onSite(host: string, site: ReviewSite): boolean {
    host = normalizeHost(host);
    return host === site || host.endsWith("." + site);
}

function linkUrl(anchor: HTMLAnchorElement, site: ReviewSite): URL | null {
    const base = anchor.ownerDocument.baseURI;
    return httpUrl(
        anchor.getAttribute("href"),
        /^https?:/iu.test(base) ? base : `https://${site}/`,
    );
}

function outletKey(
    anchor: HTMLAnchorElement,
    site: ReviewSite,
): string | undefined {
    const url = linkUrl(anchor, site);
    return url && onSite(url.hostname, site)
        ? sites[site].outlet.exec(url.pathname)?.[1]
        : undefined;
}

function outletName(anchor: HTMLAnchorElement, site: ReviewSite): string {
    const copy = anchor.cloneNode(true) as HTMLAnchorElement;
    const excluded = [
        OWNED_UI,
        "svg",
        "script",
        "style",
        "[hidden]",
        '[aria-hidden="true"]',
        sites[site].score,
    ];
    copy.querySelectorAll(excluded.filter(Boolean).join(",")).forEach(
        (element) => element.remove(),
    );
    return (copy.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function outletLinks(
    container: ParentNode,
    site: ReviewSite,
): NodeListOf<HTMLAnchorElement> {
    return container.querySelectorAll<HTMLAnchorElement>(
        `a[href*="${sites[site].outletPath}"],a[href^="${sites[site].outletPath.slice(1)}"]`,
    );
}

function findOutlet(container: Element, site: ReviewSite): Outlet | null {
    let outlet: Outlet | null = null;
    let foundHeader = false;
    const header = sites[site].header;
    for (const anchor of Array.from(outletLinks(container, site))) {
        if (anchor.closest(outsideReviews)) continue;
        const key = outletKey(anchor, site);
        const name = key ? outletName(anchor, site) : "";
        if (!key || !name || name.length > 180) continue;
        if (outlet && outlet.key !== key) return null;
        const inHeader = Boolean(
            anchor.closest(header) || anchor.querySelector(header),
        );
        if (!outlet || (!foundHeader && inHeader)) {
            outlet = { key, name, anchor };
            foundHeader = inHeader;
        }
    }
    return outlet;
}

function originalUrls(container: Element, site: ReviewSite): string[] {
    const urls = new Set<string>();
    for (const link of Array.from(
        container.querySelectorAll<HTMLAnchorElement>("a[href]"),
    )) {
        if (link.closest(outsideReviews)) continue;
        const label = (link.textContent ?? "").replace(/\s+/gu, " ").trim();
        const isReview =
            link.dataset.testid === "review-full-review-link" ||
            reviewLabel.test(label) ||
            reviewLabel.test(link.getAttribute("aria-label")?.trim() ?? "") ||
            (site === "metacritic.com" && /\bfull\s+review$/iu.test(label));
        const url = isReview ? linkUrl(link, site) : null;
        if (url && !onSite(url.hostname, site)) urls.add(url.href);
    }
    return [...urls];
}

// A nearby original-review link identifies a card without a known class.
function structuralReview(
    anchor: HTMLAnchorElement,
    site: ReviewSite,
): Review | null {
    const key = outletKey(anchor, site);
    const name = key ? outletName(anchor, site) : "";
    if (!name || name.length > 180) return null;
    let container = anchor.parentElement;
    for (
        let depth = 0;
        container && depth < 6;
        depth += 1, container = container.parentElement
    ) {
        if (container.matches("body,html,main")) break;
        const outlets = Array.from(outletLinks(container, site)).flatMap(
            (link) => {
                const linkKey = outletKey(link, site);
                return linkKey
                    ? [
                          {
                              key: linkKey,
                              named: Boolean(outletName(link, site)),
                          },
                      ]
                    : [];
            },
        );
        if (
            outlets.some((outlet) => outlet.key !== key) ||
            outlets.filter(({ named }) => named).length > 1
        )
            break;
        const urls = originalUrls(container, site);
        if (urls.length) return { container, anchor, name, urls };
    }
    return null;
}

export function collectReviews(
    document: Document,
    site: ReviewSite,
): Review[] {
    const reviews: Review[] = [];
    const accepted = new Set<Element>();
    function inAcceptedCard(node: Element): boolean {
        for (
            let parent: Element | null = node;
            parent;
            parent = parent.parentElement
        ) {
            if (accepted.has(parent)) return true;
        }
        return false;
    }

    for (const container of Array.from(
        document.querySelectorAll(sites[site].cards),
    )) {
        if (container.closest(outsideReviews) || inAcceptedCard(container))
            continue;
        const outlet = findOutlet(container, site);
        if (!outlet) continue;
        reviews.push({
            container,
            anchor: outlet.anchor,
            name: outlet.name,
            urls: originalUrls(container, site),
        });
        accepted.add(container);
    }
    for (const anchor of Array.from(outletLinks(document, site))) {
        if (anchor.closest(outsideReviews) || inAcceptedCard(anchor)) continue;
        const review = structuralReview(anchor, site);
        if (
            review &&
            !reviews.some(({ container }) =>
                review.container.contains(container),
            )
        ) {
            reviews.push(review);
            accepted.add(review.container);
        }
    }
    return reviews;
}
