/**
 * @file src/wpvg-assessor/i18n/index.ts
 * Purpose: Article Assessor locale registry.
 *
 * Contents: Locale catalogs, interface messages, and English save summaries.
 */

import * as i18n from "../support/i18n/messages.ts";
import { wikiInterfaceLocale } from "../../shared/wiki-locale.ts";
import englishCatalog from "./en.json" with { type: "json" };
import zhHansCatalog from "./zh-Hans.json" with { type: "json" };
import zhHantCatalog from "./zh-Hant.json" with { type: "json" };
import jaCatalog from "./ja.json" with { type: "json" };
import ruCatalog from "./ru.json" with { type: "json" };

export const english = englishCatalog;
export const simplifiedChinese: i18n.LocaleCatalog<typeof english> =
    zhHansCatalog;
export const traditionalChinese: i18n.LocaleCatalog<typeof english> =
    zhHantCatalog;
export const japanese: i18n.LocaleCatalog<typeof english> = jaCatalog;
export const russian: i18n.LocaleCatalog<typeof english> = ruCatalog;

export type MessageId = Extract<keyof typeof english, string>;

const SUMMARY_SOURCE_LINK = [
    "[[:m:User:For Each ... Next/global.js",
    "/vg page assessor.js|🍄]]",
].join("");

const englishMessages = i18n.createI18n(english, {});
let messages = englishMessages;
export let interfaceLocale = messages.interfaceLocale;

export function configureInterfaceLanguage(
    language: unknown,
    variant: unknown,
): void {
    const locale = typeof language === "string" ? language : "en";
    messages = i18n.createI18n(
        english,
        {
            "zh-Hans": simplifiedChinese,
            "zh-Hant": traditionalChinese,
            ja: japanese,
            ru: russian,
        },
        /^zh(?:[-_]|$)/iu.test(locale)
            ? wikiInterfaceLocale(locale, variant)
            : locale,
    );
    interfaceLocale = messages.interfaceLocale;
}

export function msg(id: MessageId, values?: i18n.MessageValues): string {
    return messages.msg(id, values);
}

/** Builds an English summary for the reviewed archive and list edits. */
export function buildArchiveSummary(): string {
    return englishMessages.msg("archive.summary", {
        source: SUMMARY_SOURCE_LINK,
    });
}
