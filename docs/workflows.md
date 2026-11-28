# Sumire workflows

Sumire uses WP's Action API readers, userscript metadata, and distribution
writer. [WP engineering workflows][wp-workflows]

## Draft Copy

The browser entrypoint selects HTTPS Chinese Wikipedia on desktop and
mobile. The action checks MediaWiki's page configuration and accepts an
existing mainspace article or draft with a viewable wikitext revision.
`mediawiki.ts` resolves titles, validates source and target revisions,
content models, and the edit form, and classifies file references through
the local API.

`wikitext.ts` adds the draft header and empty todo list, wraps categories,
and disables references to local files. Preparing an article removes
draft material and restores those categories and files.

For an existing destination, `mediawiki.ts` reads its current wikitext
and finds the most recent copy between the two pages in their revision
histories. A copy summary's revision link identifies the merge base.
The adapter verifies that the linked revision belongs to the expected
page. The browser converts the base and source to the destination's
format and merges their changes with the destination at line granularity.
It reports when the changes require manual merging. When neither history
has copy attribution, the native diff opens with the proposed source
text for manual review.

`mediawiki.ts` attributes the source revision in the edit summary and posts
the review form with the destination revision used to prepare the edit and
the current edit token. New drafts open a preview. Updates open a diff.
The wiki editor handles any subsequent edit conflict and the user saves
the reviewed changes there.

## Meta Profile Editor

The Meta Profile action opens on the configured owner's user page after
checking the current title, signed-in user, and view mode. A local wiki
displaying the global profile must identify its canonical Meta-Wiki
source. Wikimedia sites use MediaWiki's authenticated API. Other sites
link to Meta-Wiki with the `personal-gadgets-edit-contributions` query
parameter, which opens the editor on the verified profile.

`meta-api.ts` verifies the owner, title, namespace, and revision. The
profile wikitext parsers read editable records and keep unrelated source
intact. Adding an entry accepts a title, wikilink, or URL before optional
public metadata and attribution lookups. The lookups validate their own
responses and leave fields editable when information is unavailable.

`profile-wikitext.ts` numbers records in the `;` field and `:` continuation
format. Each numbered comment goes directly before the first field.
Articles, barnstars, quotations, and userboxes start at `01` at the top.
In progress and Reviews start at `01` at the bottom. The editor shows
the same numbers in its lists, including while filtering, and in the
individual wikitext previews.

Either review control opens the same preview for draft changes or for
numbering corrections on the active tab when there are no draft changes.
The editor must have no pending action or removal confirmation.
The preview shows the changed sections and English edit summary. The user
can return to the local draft or choose
**Save on Meta-Wiki**. The API adapter asserts the account and sends a
single revision-based edit. It reports an edit conflict or session
failure to the dialog, which keeps the draft available for review. An
unchanged edit returns the current revision.

## Article Assessor

The [Article Assessor](wpvg-assessor/README.md) owns assessments, new-page
registration, and archiving on desktop Chinese Wikipedia. The entrypoint
recognizes the wiki and the two supported PetScan hosts. On PetScan result
pages and the wiki's new-page list it marks eligible article and talk links
with `wpvg-assessor=1`. PetScan starts only the link decorator. The wiki startup
uses the page's MediaWiki object and loads Vue and Codex through ResourceLoader.

The MediaWiki adapters validate source, revisions, and edit results. The
workflows preserve the exact reviewed source before batch confirmation, category
class selection, or archive confirmation. The UI reports read, storage, and
write failures and retains unfinished work for review or retry. See the
[review workflow](wpvg-assessor/review-workflow.md) and
[architecture](wpvg-assessor/architecture.md).

The standalone userscript uses the `wpvg-assessor` namespace. Standalone and
aggregate builds use the same Sumire startup guard and assessment storage.

## WPVG Source Labels

The entrypoint selects the HTTPS apex and `www` hosts of Metacritic and
OpenCritic. Navigation events and route polling start annotation on
critic-review routes, where one observer per document follows review
card changes. `review-sites.ts` reads each card's outlet name and
original links. Scheduled source-table refreshes run on review routes.

The browser reads the userscript manager's `wpvg-source-cache-v2` and
`wpvg-source-settings-v1` keys. `source-data.ts` validates stored values
and checks the revision and expected origin of anonymous source requests.
`source-table.ts` parses source table HTML in a detached template and
builds typed records. `source-match.ts` ranks those records against each
review and exposes the evidence for the displayed label. The interface
reports failed refreshes and keeps the last valid cache available.

The standalone userscript preserves its Tampermonkey identity and
storage. Sumire's aggregate has its own manager storage with the same
cache and settings schema. Only the review-host startup uses GM APIs.

## Distribution

`package.json` supplies the version, license, and aggregate description.
`scripts/build.mjs` registers and bundles the tools with esbuild.

Both aggregate files bundle the four tools. Each tool also has its own
`.user.js` and `.min.js` files. The aggregate dispatches the wiki tools on
eligible wiki pages, Article Assessor link decoration on PetScan, and
WPVG Source Labels on review sites. Action IDs, startup symbols, and
the review observer's document marker guard against duplicate mounting.

Wiki tools use the page's MediaWiki object and ResourceLoader modules.
The aggregate can access that object through Tampermonkey's JavaScript
sandbox. The WPVG Source Labels pair uses Tampermonkey's DOM sandbox.
Both aggregate formats and both WPVG Source Labels formats declare the
manager permissions required on review sites. Source Labels starts only
where those APIs are available. See the
[installation guide](../README.md#install-and-use).
[Tampermonkey documentation][tampermonkey]

The shared build stages scripts, `LICENSE.txt`, the manifest, and
checksums before replacing `dist/`.

`npm run verify` checks formatting, lint, types, and tool tests, then builds
and checks the distribution in `dist/` and runs the Article Assessor browser
tests. The artifact tests exercise manager and native startup. Verification
uses local fixtures for wiki interactions.

Dispatch **Release** with publication disabled to verify the selected ref
or a supplied release tag. To publish, provide the annotated `v<version>`
tag and enable **Publish the verified release**.

[tampermonkey]: https://www.tampermonkey.net/documentation.php
[wp-workflows]: https://github.com/For-Each-Next/wp/blob/trunk/docs/workflows.md
