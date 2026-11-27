import { isPositiveSafeInteger } from "@for-each-next/wp/mediawiki";
import { draftHosts } from "../shared/hosts.ts";
import { documentReady, startOnWiki } from "../shared/wiki-startup.ts";
import { getMessages } from "./messages.ts";
import {
    DraftCopyError,
    findLocalReferences,
    openEditReview,
    readSource,
    readTarget,
    type MediaWiki,
} from "./mediawiki.ts";
import {
    findFileReferences,
    mirrorToDraft,
    publishDraft,
} from "./wikitext.ts";

const MAIN_NAMESPACE = 0;
const ACTION_ID = "ca-draft-copy";

export async function addDraftCopyAction(
    mw: MediaWiki,
    document: Document,
): Promise<HTMLLIElement | null> {
    await documentReady(document);
    // MediaWiki exposes the namespace aliases when mediawiki.Title loads.
    await mw.loader.using([
        "mediawiki.api",
        "mediawiki.Title",
        "mediawiki.util",
        "mediawiki.user",
    ]);
    if (document.getElementById(ACTION_ID)) return null;

    const config = mw.config.get.bind(mw.config);
    const namespace = config("wgNamespaceNumber");
    const namespaces = config("wgNamespaceIds");
    const draftNamespace = namespaces?.draft;
    const pageId = config("wgArticleId") ?? 0;
    const revisionId = config("wgRevisionId") ?? 0;
    if (
        config("wgDBname") !== "zhwiki" ||
        config("wgAction") !== "view" ||
        config("wgPageContentModel") !== "wikitext" ||
        config("wgIsMainPage") ||
        config("wgIsRedirect") ||
        config("wgDiffNewId") ||
        !isPositiveSafeInteger(pageId) ||
        !isPositiveSafeInteger(revisionId) ||
        !namespaces ||
        draftNamespace === undefined ||
        !Number.isInteger(draftNamespace) ||
        (namespace !== MAIN_NAMESPACE && namespace !== draftNamespace)
    ) {
        return null;
    }
    const title = mw.Title.newFromText(config("wgPageName") ?? "");
    if (!title || title.getNamespaceId() !== namespace) return null;
    const mirroring = namespace === MAIN_NAMESPACE;
    const messages = getMessages(
        config("wgUserLanguage"),
        config("wgUserVariant"),
    );
    const label = mirroring ? messages.mirror : messages.publish;
    const item = mw.util.addPortletLink("p-cactions", "#", label, ACTION_ID);
    const link = item?.querySelector("a");
    if (!item || !link) return null;

    let preparing = false;
    const linkLabel = link.querySelector(".vector-menu-item-label") ?? link;
    link.addEventListener("click", async (event) => {
        event.preventDefault();
        if (preparing) return;
        preparing = true;
        link.setAttribute("aria-disabled", "true");
        linkLabel.textContent = messages.preparing;
        try {
            const articleName = title.getMainText();
            const target = mirroring
                ? mw.Title.makeTitle(draftNamespace, articleName)
                : mw.Title.newFromText(articleName);
            if (
                !target ||
                target.getNamespaceId() !==
                    (mirroring ? draftNamespace : MAIN_NAMESPACE)
            ) {
                throw new DraftCopyError("invalidTitle");
            }
            const api = new mw.Api({ parameters: { formatversion: 2 } });
            const source = await readSource(mw, api, {
                title,
                pageId,
                revisionId,
            });
            let text;
            if (mirroring) {
                const references = findFileReferences(source.text, namespaces);
                const local = await findLocalReferences(mw, api, references);
                text = mirrorToDraft(
                    source.text,
                    articleName,
                    local,
                    namespaces,
                );
            } else {
                text = publishDraft(source.text, namespaces);
            }
            const edit = await readTarget(mw, api, target);
            openEditReview(
                mw,
                document,
                target,
                source,
                text,
                edit,
                mirroring,
            );
        } catch (error) {
            const message =
                error instanceof DraftCopyError
                    ? messages[error.key]
                    : messages.failed;
            mw.notify(message, { type: "error" });
            mw.log?.warn("[draft-copy]", error);
        } finally {
            preparing = false;
            link.removeAttribute("aria-disabled");
            linkLabel.textContent = label;
        }
    });
    return item;
}

export function startDraftCopy(
    browser: Window,
    page: Window & { mw?: MediaWiki } = browser,
): void {
    const { protocol, hostname } = browser.location;
    if (protocol === "https:" && draftHosts.includes(hostname)) {
        startOnWiki(browser, page, "draft-copy", addDraftCopyAction);
    }
}
