import { documentReady, startOnWiki } from "../shared/wiki-startup.ts";
import { getActionMessages } from "./action-messages.ts";
import { openProfileDialog } from "./dialog.ts";
import {
    META_API_URL,
    META_ORIGIN,
    META_PROFILE_URL,
    PROFILE_OWNER,
    PROFILE_TITLE,
    MetaContributionsError,
    readMetaProfile,
    type MetaApi,
} from "./meta-api.ts";

const ACTION_ID = "ca-meta-contributions";
const OPEN_EDITOR = "personal-gadgets-edit-contributions";
const authenticatedSites =
    /(?:^|\.)(?:wikimedia|wikipedia|wikibooks|wikidata|wikifunctions|wikinews|wikiquote|wikisource|wikiversity|wikivoyage|wiktionary|mediawiki)\.org$/u;

type HostRequire = (moduleName: string) => unknown;
type ApiOptions = { parameters: { formatversion: 2 } };

interface HostWiki {
    config: { get(name: string): unknown };
    loader: { using(modules: string[]): PromiseLike<HostRequire> };
    Api: new (options: ApiOptions) => MetaApi;
    ForeignApi: new (
        url: string,
        options: ApiOptions & { anonymous: false },
    ) => MetaApi;
    util: {
        addPortletLink(
            portlet: string,
            href: string,
            label: string,
            id: string,
        ): HTMLLIElement | null;
    };
    notify(message: string, options: { type: "error" }): void;
    log?: { warn(...details: unknown[]): void };
}

function isProfileView(mw: HostWiki): boolean {
    const config = mw.config.get.bind(mw.config);
    return (
        config("wgAction") === "view" &&
        config("wgNamespaceNumber") === 2 &&
        config("wgTitle") === PROFILE_OWNER &&
        config("wgUserName") === PROFILE_OWNER &&
        !config("wgDiffNewId")
    );
}

function showsMetaProfile(mw: HostWiki, document: Document): boolean {
    if (document.location.origin === META_ORIGIN) return true;
    if (mw.config.get("wgArticleId") !== 0) return false;
    const canonical = document.querySelector<HTMLLinkElement>(
        'link[rel="canonical"]',
    )?.href;
    if (!canonical) return false;
    try {
        const source = new URL(canonical);
        if (source.origin !== META_ORIGIN) return false;
        const title = source.pathname.startsWith("/wiki/")
            ? decodeURIComponent(source.pathname.slice("/wiki/".length))
            : source.pathname === "/w/index.php"
              ? source.searchParams.get("title")
              : null;
        return title?.replaceAll("_", " ") === PROFILE_TITLE;
    } catch {
        return false;
    }
}

function metaEditorUrl(): string {
    const url = new URL(META_PROFILE_URL);
    url.searchParams.set(OPEN_EDITOR, "1");
    return url.href;
}

function actionLabel(link: HTMLAnchorElement): Element {
    return (
        link.querySelector(".vector-menu-item-label") ??
        link.querySelector('span:not([aria-hidden="true"])') ??
        link
    );
}

function placeAction(
    mw: HostWiki,
    document: Document,
    label: string,
): HTMLAnchorElement | null {
    const isMeta = document.location.origin === META_ORIGIN;
    const slot = document.getElementById("ca-edit");
    const original = slot?.matches("a")
        ? (slot as HTMLAnchorElement)
        : slot?.querySelector("a");
    if (!isMeta && slot && original) {
        const link = original.cloneNode(true) as HTMLAnchorElement;
        link.href = META_PROFILE_URL;
        link.title = label;
        link.setAttribute("aria-label", label);
        actionLabel(link).textContent = label;
        original.replaceWith(link);
        (slot === original ? link : slot).id = ACTION_ID;
        return link;
    }

    const portlet = isMeta
        ? slot?.closest(".mw-portlet")?.id || "p-views"
        : "p-cactions";
    let action = mw.util.addPortletLink(
        portlet,
        META_PROFILE_URL,
        label,
        ACTION_ID,
    );
    if (!action && portlet !== "p-cactions") {
        action = mw.util.addPortletLink(
            "p-cactions",
            META_PROFILE_URL,
            label,
            ACTION_ID,
        );
    }
    if (action) return action.querySelector("a");

    const heading =
        document.getElementById("Contributions") ??
        document.getElementById("firstHeading");
    const headingBlock = heading?.closest(".mw-heading, h2") ?? heading;
    if (!headingBlock) return null;

    const link = document.createElement("a");
    link.id = ACTION_ID;
    link.href = META_PROFILE_URL;
    link.textContent = label;
    headingBlock.insertAdjacentElement("afterend", link);
    return link;
}

async function makeMetaApi(mw: HostWiki, origin: string): Promise<MetaApi> {
    const options = { parameters: { formatversion: 2 as const } };
    if (origin === META_ORIGIN) {
        await mw.loader.using(["mediawiki.api"]);
        return new mw.Api(options);
    }
    await mw.loader.using(["mediawiki.ForeignApi"]);
    return new mw.ForeignApi(META_API_URL, { ...options, anonymous: false });
}

export async function addContributionsAction(
    mw: HostWiki,
    document: Document,
): Promise<HTMLAnchorElement | null> {
    const { hostname, origin, protocol, search } = document.location;
    if (!isProfileView(mw)) return null;
    await documentReady(document);
    if (!showsMetaProfile(mw, document)) return null;
    await mw.loader.using(["mediawiki.util"]);
    if (document.getElementById(ACTION_ID)) return null;

    const language = mw.config.get("wgUserLanguage");
    const variant = mw.config.get("wgUserVariant");
    const messages = getActionMessages(language, variant);
    const actionText =
        origin === META_ORIGIN ? messages.metaAction : messages.action;
    const link = placeAction(mw, document, actionText);
    if (!link) return null;
    if (protocol !== "https:" || !authenticatedSites.test(hostname)) {
        link.href = metaEditorUrl();
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return link;
    }

    let opening = false;
    const label = actionLabel(link);
    function localizedError(error: unknown, fallback: string): Error {
        mw.log?.warn("[meta-contributions]", error);
        return new Error(
            error instanceof MetaContributionsError
                ? messages[error.key]
                : fallback,
            { cause: error },
        );
    }
    const openEditor = async () => {
        if (opening) return;
        opening = true;
        link.setAttribute("aria-disabled", "true");
        label.textContent = messages.preparing;
        try {
            const api = await makeMetaApi(mw, origin);
            const editor = await readMetaProfile(api);
            if (
                !editor.contributions &&
                !editor.barnstars &&
                !editor.quotations &&
                !editor.userboxes
            ) {
                throw new MetaContributionsError("unknownLayout");
            }
            label.textContent = actionText;
            await openProfileDialog({
                loader: mw.loader,
                document,
                language,
                variant,
                metaPageUrl: META_PROFILE_URL,
                editor: {
                    ...editor,
                    preview: (edits) =>
                        editor.preview(edits).catch((error) => {
                            throw localizedError(
                                error,
                                messages.previewFailed,
                            );
                        }),
                    previewItem: (source) =>
                        editor.previewItem(source).catch((error) => {
                            throw localizedError(
                                error,
                                messages.previewFailed,
                            );
                        }),
                    save: (edits, summary) =>
                        editor.save(edits, summary).catch((error) => {
                            throw localizedError(error, messages.saveFailed);
                        }),
                },
            });
        } catch (error) {
            mw.notify(localizedError(error, messages.openFailed).message, {
                type: "error",
            });
        } finally {
            opening = false;
            link.removeAttribute("aria-disabled");
            label.textContent = actionText;
        }
    };
    link.addEventListener("click", (event) => {
        if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        )
            return;
        event.preventDefault();
        void openEditor();
    });
    if (
        origin === META_ORIGIN &&
        new URLSearchParams(search).get(OPEN_EDITOR) === "1"
    )
        void openEditor();
    return link;
}

export function startMetaContributions(
    browser: Window,
    page: Window & { mw?: HostWiki } = browser,
): void {
    startOnWiki(browser, page, "meta-contributions", addContributionsAction);
}
