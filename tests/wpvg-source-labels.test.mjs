import assert from "node:assert/strict";
import test from "node:test";

import {
    isReviewPage,
    reviewSite,
} from "../src/wpvg-source-labels/review-sites.ts";
import {
    fetchSourcePage,
    revisionUrl,
    validSourceCache,
} from "../src/wpvg-source-labels/source-data.ts";
import {
    buildSourceIndex,
    matchSource,
} from "../src/wpvg-source-labels/source-match.ts";
import {
    SOURCE_TITLE,
    SOURCE_URL,
} from "../src/wpvg-source-labels/source-table.ts";

function source(name, urlRules = [], overrides = {}) {
    return {
        name,
        aliases: [name],
        urlRules,
        sourceKey: name,
        anchor: name.replaceAll(" ", "_"),
        status: "reliable",
        section: "Reliable sources",
        subsection: "",
        dates: "",
        notes: "",
        contextNotes: "",
        discussions: [],
        primary: false,
        temporal: false,
        ...overrides,
    };
}

test("URL matches prefer the longest matching path and respect complete path segments", () => {
    const host = "publisher.example";
    const publisher = source("Publisher", [{ host, path: "/" }]);
    const magazine = source("Game Magazine", [{ host, path: "/magazine" }]);
    const index = buildSourceIndex([publisher, magazine]);
    for (const path of ["/magazine", "/magazine/review"]) {
        const result = matchSource(index, {
            name: "Ｇａｍｅ－Ｍａｇａｚｉｎｅ",
            urls: [`https://www.${host}${path}`],
        });
        assert.equal(result.matchedBy, "name+domain");
        assert.deepEqual(result.records, [magazine]);
    }
    const siblingUrl = `https://${host}/magazines/review`;
    assert.deepEqual(
        matchSource(index, { name: "", urls: [siblingUrl] }).records,
        [publisher],
    );
    const mismatch = matchSource(buildSourceIndex([magazine]), {
        name: magazine.name,
        urls: [siblingUrl],
    });
    assert.equal(mismatch.scopeMismatch, true);
    assert.equal(mismatch.status, "unknown");
    assert.deepEqual(mismatch.records, []);
});

test("a domain match retains each dated row for the same outlet", () => {
    const earlier = source(
        "Game Journal",
        [{ host: "former.example", path: "/" }],
        {
            dates: "2019–2024",
            temporal: true,
        },
    );
    const later = source(
        "Game Journal",
        [{ host: "current.example", path: "/" }],
        {
            dates: "2025–",
            status: "unreliable",
            temporal: true,
        },
    );
    const index = buildSourceIndex([earlier, later]);
    const result = matchSource(index, {
        name: "",
        urls: ["https://current.example/review"],
    });
    assert.equal(result.matchedBy, "domain");
    assert.deepEqual(result.records, [earlier, later]);
    assert.equal(result.status, "unknown");
    assert.equal(result.requiresReview, true);
    assert.equal(result.conflict, false);
});

test("an unqualified regional alias requires a URL within the outlet scope", () => {
    const host = "publisher.example";
    const publisher = source("Publisher", [{ host, path: "/" }]);
    const regional = source(
        "Game Magazine (UK)",
        [{ host, path: "/magazine" }],
        {
            scopedAliases: ["Game Magazine"],
        },
    );
    const index = buildSourceIndex([publisher, regional]);
    const name = "Game Magazine";
    assert.equal(matchSource(index, { name, urls: [] }).status, "unknown");
    assert.deepEqual(
        matchSource(index, { name, urls: [`https://${host}/magazine/review`] })
            .records,
        [regional],
    );
    const wrongScope = matchSource(index, {
        name,
        urls: [`https://${host}/magazines/review`],
    });
    assert.equal(wrongScope.conflict, true);
    assert.deepEqual(wrongScope.records, [regional, publisher]);
});

test("a name can disambiguate a shared domain, while a dated change still requires review", () => {
    const urlRules = [{ host: "shared.example", path: "/" }];
    const original = source("Original Review", urlRules);
    const successor = source("Later Review", urlRules, {
        status: "unreliable",
    });
    const urls = ["https://shared.example/review"];
    const shared = buildSourceIndex([original, successor]);
    const disputed = matchSource(shared, { name: "", urls });
    assert.equal(disputed.status, "unknown");
    assert.equal(disputed.conflict, true);
    assert.deepEqual(disputed.records, [original, successor]);
    const named = matchSource(shared, { name: original.name, urls });
    assert.equal(named.status, "reliable");
    assert.deepEqual(named.records, [original]);

    const dated = { ...successor, dates: "2025–", temporal: true };
    const result = matchSource(buildSourceIndex([original, dated]), {
        name: original.name,
        urls,
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.requiresReview, true);
    assert.equal(result.conflict, false);
    assert.deepEqual(result.records, [original, dated]);
});

test("one corroborating review link does not conceal a second link to a different source", () => {
    const original = source("Original Review", [
        { host: "original.example", path: "/" },
    ]);
    const other = source("Other Review", [
        { host: "other.example", path: "/" },
    ]);
    const result = matchSource(buildSourceIndex([original, other]), {
        name: original.name,
        urls: [
            "https://original.example/review",
            "https://other.example/review",
        ],
    });
    assert.equal(result.status, "unknown");
    assert.equal(result.conflict, true);
    assert.deepEqual(result.records, [original, other]);
});

test("the source request retrieves an anonymous revision and the link retains its row anchor", async () => {
    const responseText = JSON.stringify({
        parse: { text: "<div>Source table</div>", revid: 628 },
    });
    const page = await fetchSourcePage((request) => {
        const url = new URL(request.url);
        assert.equal(url.origin, "https://en.wikipedia.org");
        assert.equal(url.pathname, "/w/api.php");
        assert.equal(url.searchParams.get("action"), "parse");
        assert.equal(url.searchParams.get("page"), SOURCE_TITLE);
        assert.equal(url.searchParams.get("prop"), "text|revid");
        assert.equal(request.anonymous, true);
        queueMicrotask(() =>
            request.onload({ status: 200, finalUrl: url.href, responseText }),
        );
    });
    assert.deepEqual(page, { html: "<div>Source table</div>", revision: 628 });
    const link = new URL(revisionUrl(page.revision, "Print_&_online"));
    assert.equal(link.searchParams.get("oldid"), "628");
    assert.equal(decodeURIComponent(link.hash.slice(1)), "Print_&_online");
});

test("a malformed or foreign-origin source response is rejected", async () => {
    const validResponse = JSON.stringify({
        parse: { text: "<div></div>", revid: 628 },
    });
    const responses = [
        [{ responseText: "<html>Maintenance</html>" }, /格式無效/u],
        [
            {
                responseText: JSON.stringify({
                    parse: { text: "<div></div>", revid: 0 },
                }),
            },
            /未回傳完整來源表/u,
        ],
        [
            {
                finalUrl: "https://en.wikipedia.org.example/w/api.php",
                responseText: validResponse,
            },
            /回應異常/u,
        ],
    ];
    for (const [response, message] of responses) {
        await assert.rejects(
            fetchSourcePage(({ onload }) => {
                queueMicrotask(() => onload({ status: 200, ...response }));
            }),
            message,
        );
    }
});

test("cache validation rejects incomplete, corrupted, and future snapshots", () => {
    const now = Date.UTC(2026, 10, 27);
    const records = [
        ...Array.from({ length: 27 }, (_, index) => source(`Review ${index}`)),
        ...["situational", "unreliable", "inconclusive"].map((status) =>
            source(status, [], { status }),
        ),
    ];
    const cache = {
        schema: 2,
        sourceUrl: SOURCE_URL,
        revision: 628,
        fetchedAt: now,
        records,
        sectionCounts: {
            reliable: 27,
            situational: 1,
            unreliable: 1,
            inconclusive: 1,
        },
    };
    assert.equal(validSourceCache(cache, now), true);
    assert.equal(
        validSourceCache({ ...cache, records: records.slice(1) }, now),
        false,
    );
    assert.equal(
        validSourceCache({ ...cache, fetchedAt: now + 61_000 }, now),
        false,
    );
    assert.equal(
        validSourceCache(
            { ...cache, records: [null, ...records.slice(1)] },
            now,
        ),
        false,
    );
    const badRule = {
        ...records[0],
        urlRules: [{ host: "review.example", path: "relative" }],
    };
    assert.equal(
        validSourceCache(
            { ...cache, records: [badRule, ...records.slice(1)] },
            now,
        ),
        false,
    );
});

test("only supported review sites and game critic review routes qualify", () => {
    assert.equal(reviewSite("www.metacritic.com"), "metacritic.com");
    assert.equal(reviewSite("opencritic.com"), "opencritic.com");
    assert.equal(reviewSite("www.metacritic.com.example"), null);
    assert.equal(
        isReviewPage("metacritic.com", "/game/hades/critic-reviews/"),
        true,
    );
    assert.equal(
        isReviewPage("metacritic.com", "/game/hades/user-reviews/"),
        false,
    );
    assert.equal(
        isReviewPage("opencritic.com", "/game/10181/hades/reviews"),
        true,
    );
    assert.equal(isReviewPage("opencritic.com", "/game/10181/hades"), false);
    assert.equal(
        isReviewPage("opencritic.com", "/game/browse/hades/reviews"),
        false,
    );
});
