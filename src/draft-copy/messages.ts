import { wikiInterfaceLocale } from "../shared/wiki-locale.ts";

const en = {
    mirror: "Copy to draft",
    publish: "Publish draft",
    preparing: "Preparing edit…",
    invalidTitle:
        "The destination must be a valid page in the other namespace.",
    sourceUnavailable: "The source revision could not be read.",
    targetUnavailable:
        "The destination could not be opened for source editing.",
    mergeUnavailable:
        "The article and draft changes could not be merged automatically. Compare the pages and merge the changes manually.",
    failed: "The draft copy could not be prepared. Please try again.",
};

const zhHans = {
    mirror: "复制到草稿",
    publish: "发布草稿",
    preparing: "正在准备编辑…",
    invalidTitle: "目标必须是另一命名空间中的有效页面。",
    sourceUnavailable: "无法读取来源版本。",
    targetUnavailable: "无法打开目标页面的源代码编辑器。",
    mergeUnavailable:
        "无法自动合并条目和草稿的改动。请比较两个页面并手动合并。",
    failed: "无法准备复制，请重试。",
};

const zhHant = {
    mirror: "複製至草稿",
    publish: "發佈草稿",
    preparing: "正在準備編輯…",
    invalidTitle: "目標必須是另一命名空間中的有效頁面。",
    sourceUnavailable: "無法讀取來源版本。",
    targetUnavailable: "無法開啟目標頁面的原始碼編輯器。",
    mergeUnavailable:
        "無法自動合併條目和草稿的改動。請比較兩個頁面並手動合併。",
    failed: "無法準備複製，請重試。",
};

export type ErrorMessageKey =
    | "invalidTitle"
    | "sourceUnavailable"
    | "targetUnavailable"
    | "mergeUnavailable"
    | "failed";

const catalogs = { en, "zh-Hans": zhHans, "zh-Hant": zhHant };

export function getMessages(language: string | null, variant: string | null) {
    return catalogs[wikiInterfaceLocale(language, variant)];
}
