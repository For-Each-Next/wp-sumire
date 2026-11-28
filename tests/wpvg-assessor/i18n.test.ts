/**
 * @file tests/wpvg-assessor/i18n.test.ts
 * Purpose: Tests Article Assessor locale catalogs and project-option labels.
 *
 * Contents: Locale parity, translated options, and English archive summaries.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createI18n } from "../../src/wpvg-assessor/support/i18n/messages.ts";
import {
    buildArchiveSummary,
    english,
    japanese,
    simplifiedChinese,
    russian,
    traditionalChinese,
} from "../../src/wpvg-assessor/i18n/index.ts";

const translations = {
    "zh-Hans": simplifiedChinese,
    "zh-Hant": traditionalChinese,
    ja: japanese,
    ru: russian,
};

test("keeps translated catalogs aligned with English", () => {
    const messageIds = (
        Object.keys(english) as Array<keyof typeof english>
    ).toSorted();

    for (const catalog of Object.values(translations)) {
        assert.deepEqual(Object.keys(catalog).toSorted(), messageIds);
        for (const id of messageIds) {
            assert.deepEqual(
                [...catalog[id].matchAll(/\{[A-Za-z][A-Za-z0-9]*\}/gu)]
                    .map((match) => match[0])
                    .toSorted(),
                [...english[id].matchAll(/\{[A-Za-z][A-Za-z0-9]*\}/gu)]
                    .map((match) => match[0])
                    .toSorted(),
                id,
            );
        }
    }
});

test("selects Japanese and Russian regional interface locales", () => {
    const ja = createI18n(english, translations, "ja-JP");
    const ru = createI18n(english, translations, "ru_RU");
    assert.equal(ja.interfaceLocale, "ja");
    assert.equal(ru.interfaceLocale, "ru");
    assert.equal(ja.msg("dialog.cancel"), "キャンセル");
    assert.equal(ru.msg("dialog.cancel"), "Отмена");
    assert.equal(
        ru.msg("dialog.title", { title: "任天堂" }),
        "Article Assessor (任天堂)",
    );
});

test("localizes configured project and task-force labels", () => {
    const simplified = createI18n(english, translations, "zh-CN");
    const traditional = createI18n(english, translations, "zh-TW");

    assert.equal(simplified.msg("taskForce.minecraft"), "我的世界");
    assert.equal(simplified.msg("project.fictionalCharacters"), "虚构角色");
    assert.equal(traditional.msg("taskForce.pokemon"), "寶可夢");
    assert.equal(traditional.msg("project.biography"), "傳記");
});

test("localizes assessment codes without changing stored values", () => {
    const simplified = createI18n(english, translations, "zh-CN");
    const traditional = createI18n(english, translations, "zh-TW");

    assert.equal(simplified.msg("assessmentClass.unassessed"), "未评");
    assert.equal(simplified.msg("assessmentClass.substub"), "小小");
    assert.equal(simplified.msg("assessmentClass.d"), "丁");
    assert.equal(simplified.msg("assessmentClass.b"), "乙");
    assert.equal(simplified.msg("assessmentClass.bPlus"), "乙上");
    assert.equal(simplified.msg("assessmentClass.ga"), "优良");
    assert.equal(simplified.msg("assessmentClass.a"), "甲");
    assert.equal(simplified.msg("assessmentClass.fa"), "典范");
    assert.equal(simplified.msg("assessmentClass.bl"), "乙表");
    assert.equal(simplified.msg("assessmentClass.al"), "甲表");
    assert.equal(simplified.msg("assessmentClass.fl"), "特表");
    assert.equal(simplified.msg("assessmentImportance.top"), "极高");
    assert.equal(traditional.msg("assessmentClass.unassessed"), "未評");
    assert.equal(traditional.msg("assessmentClass.ga"), "優良");
    assert.equal(traditional.msg("assessmentClass.fa"), "典範");
    assert.equal(traditional.msg("assessmentImportance.top"), "極高");
});

test("names the new-page workflow as registration", () => {
    const simplified = createI18n(english, translations, "zh-CN");
    const traditional = createI18n(english, translations, "zh-TW");

    assert.equal(simplified.msg("dialog.newPageList"), "新条目登记");
    assert.equal(traditional.msg("dialog.newPageList"), "新條目登記");
});

test("puts the article name in the localized dialog title", () => {
    const simplified = createI18n(english, translations, "zh-CN");
    const traditional = createI18n(english, translations, "zh-TW");

    assert.equal(
        simplified.msg("dialog.title", { title: "善记" }),
        "条目评级（善记）",
    );
    assert.equal(
        traditional.msg("dialog.title", { title: "善記" }),
        "條目評級（善記）",
    );
});

test("writes an English archive summary independently of interface messages", () => {
    assert.equal(
        buildArchiveSummary(),
        "Archive new-page records [[:m:User:For Each ... Next/global.js/vg page assessor.js|🍄]]",
    );
});

test("describes an expired registration with its full creation date", () => {
    const simplified = createI18n(english, translations, "zh-CN");

    assert.equal(
        simplified.msg("registration.ineligible", {
            date: "2026年4月7日",
        }),
        "创建于2026年4月7日，已过登记期",
    );
});
