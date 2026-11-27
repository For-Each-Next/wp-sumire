export function wikiInterfaceLocale(
    language: unknown,
    variant: unknown,
): "en" | "zh-Hans" | "zh-Hant" {
    const locale =
        typeof language === "string"
            ? language.replaceAll("_", "-").toLowerCase()
            : "en";
    if (!/^zh(?:-|$)/u.test(locale)) return "en";
    const chinese =
        locale === "zh" && typeof variant === "string"
            ? variant.replaceAll("_", "-").toLowerCase()
            : locale;
    return /^zh-(?:hant|tw|hk|mo)(?:-|$)/u.test(chinese)
        ? "zh-Hant"
        : "zh-Hans";
}
