import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const directory = new URL("../../docs/wpvg-assessor/images/", import.meta.url);

test("moved documentation screenshots match their inventory and historical capture ledger", async () => {
    const [files, inventory, ledger] = await Promise.all([
        readdir(directory),
        readFile(new URL("README.md", directory), "utf8"),
        readFile(new URL("live-captures.json", directory), "utf8").then(
            JSON.parse,
        ),
    ]);
    const captures = ledger.pages.flatMap(({ captures }) => captures);
    assert.deepEqual(
        files.filter((file) => file.endsWith(".png")).sort(),
        captures.map(({ image }) => image).sort(),
    );
    for (const {
        image,
        imageSha256,
        viewport,
        deviceScaleFactor,
    } of captures) {
        assert.ok(inventory.includes(`](<${image}>)`), image);
        const source = await readFile(
            new URL(encodeURIComponent(image), directory),
        );
        assert.equal(
            createHash("sha256").update(source).digest("hex"),
            imageSha256,
        );
        assert.equal(
            source.readUInt32BE(16),
            viewport.width * deviceScaleFactor,
        );
        assert.equal(
            source.readUInt32BE(20),
            viewport.height * deviceScaleFactor,
        );
    }
});
