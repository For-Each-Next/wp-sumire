import { wikiInterfaceLocale } from "../shared/wiki-locale.ts";

const catalogs = {
    en: {
        action: "Edit profile",
        metaAction: "Edit contributions",
        preparing: "Loading profile…",
        signIn: "Sign in to Meta-Wiki as For Each ... Next and try again.",
        sourceFailed: "The Meta-Wiki user page could not be read.",
        unknownLayout:
            "The Meta-Wiki profile uses a format this editor cannot read.",
        invalidFields:
            "Check that the fields contain valid wikitext, then try again.",
        conflict:
            "The page changed on Meta-Wiki. Copy any unsaved changes, then reopen the editor to load the latest version.",
        previewFailed: "Meta-Wiki could not render the preview. Try again.",
        saveFailed:
            "Meta-Wiki could not confirm the save. Check the page before retrying.",
        openFailed: "The profile editor could not be opened. Try again.",
    },
    "zh-Hans": {
        action: "编辑用户资料",
        metaAction: "编辑贡献",
        preparing: "正在加载用户资料…",
        signIn: "请在元维基以 For Each ... Next 登录后重试。",
        sourceFailed: "无法读取元维基用户页。",
        unknownLayout: "编辑器无法读取元维基用户资料的格式。",
        invalidFields: "请检查各字段中的维基文本，然后重试。",
        conflict:
            "元维基上的页面已有更新。请复制未保存的修改，再重新打开编辑器以加载最新版本。",
        previewFailed: "元维基无法生成预览，请重试。",
        saveFailed: "元维基未能确认保存结果。请检查页面后再重试。",
        openFailed: "无法打开用户资料编辑器，请重试。",
    },
    "zh-Hant": {
        action: "編輯使用者資料",
        metaAction: "編輯貢獻",
        preparing: "正在載入使用者資料…",
        signIn: "請在元維基以 For Each ... Next 登入後重試。",
        sourceFailed: "無法讀取元維基使用者頁面。",
        unknownLayout: "編輯器無法讀取元維基使用者資料的格式。",
        invalidFields: "請檢查各欄位中的維基文字，然後再試一次。",
        conflict:
            "元維基上的頁面已有更新。請複製未儲存的修改，再重新開啟編輯器以載入最新版本。",
        previewFailed: "元維基無法產生預覽，請再試一次。",
        saveFailed: "元維基未能確認儲存結果。請檢查頁面後再重試。",
        openFailed: "無法開啟使用者資料編輯器，請重試。",
    },
};

export function getActionMessages(language: unknown, variant: unknown) {
    return catalogs[wikiInterfaceLocale(language, variant)];
}
