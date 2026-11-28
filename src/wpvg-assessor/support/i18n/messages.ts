/**
 * @file src/wpvg-assessor/support/i18n/messages.ts
 * Purpose: Share pure catalog translation and locale resolution across tools.
 *
 * Contents: Typed catalogs, locale fallback, and named text interpolation.
 */

type MessageCatalog = Record<string, string>;
export type MessageValues = Record<string, string | number>;
export type LocaleCatalog<Source extends MessageCatalog> = {
    [Id in keyof Source]: string;
};

export interface TypedI18n<Id extends string> {
    interfaceLocale: string;
    msg(id: Id, values?: MessageValues): string;
}

/** Creates a translator whose message keys come from its English catalog. */
export function createI18n<Source extends MessageCatalog>(
    english: Source,
    translations: Record<string, LocaleCatalog<Source>>,
    locale = "en",
): TypedI18n<Extract<keyof Source, string>> {
    const catalogs: Record<string, MessageCatalog> = {
        en: english,
        ...translations,
    };
    const interfaceLocale = resolveLocale(locale, Object.keys(catalogs));
    return {
        interfaceLocale,
        msg(id, values = {}) {
            const template =
                catalogs[interfaceLocale]?.[id] || catalogs.en?.[id] || id;
            return template.replace(
                /\{([A-Za-z][A-Za-z0-9]*)\}/gu,
                (placeholder, name: string) =>
                    String(values[name] ?? placeholder),
            );
        },
    };
}

/** Resolves exact, Chinese-variant, base-language, and English catalogs. */
export function resolveLocale(
    locale: string,
    availableLocales: string[],
): string {
    const available = new Map(
        availableLocales.map((entry) => [entry.toLocaleLowerCase(), entry]),
    );
    const normalized = normalizeLocale(locale).toLocaleLowerCase();
    return (
        available.get(normalized) ??
        available.get(normalized.split("-")[0]) ??
        (available.get("en") || availableLocales[0] || "en")
    );
}

function normalizeLocale(locale: string): string {
    const value = (locale || "en").replace(/_/gu, "-");
    if (/^zh(?:-(?:cn|hans|my|sg))?$/iu.test(value)) return "zh-Hans";
    if (/^zh-(?:hk|hant|mo|tw)$/iu.test(value)) return "zh-Hant";
    return value;
}
