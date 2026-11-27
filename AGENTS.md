# Sumire contributor instructions

Read [Workflows](docs/workflows.md) before changing a tool or its
distribution. Use the shared WP APIs for Action API envelopes, metadata,
distribution verification, and releases.

Each tool owns its startup eligibility and UI. Keep review-site grants
and storage with WPVG Source Labels. Preserve explicit review and save
behavior in the Wiki tools.

Use `npm run format` to apply the shared formatter.

<!-- wp:workflow configs/agent-workflow.md sha256=dd4415bf64b2bac69b3d986e57034d85a2fa5296d00fe3e0945ce0b361a431ae -->

## Shared engineering workflow

Describe workflow and contract changes in the product's Markdown before
implementing them. Validate incoming data at the adapter, entrypoint,
or configuration loader that owns its contract. Use the resulting
types downstream and test the boundary and user behavior.

Install with the product lockfiles and run `npm run verify`. WP owns
shared code and reusable CI. Update the immutable WP dependency in a
reviewable product change. Product builds and tests use local fixtures
for wiki interactions.
<!-- /wp:workflow -->
