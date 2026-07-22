# Refreshing extension webhooks from the manifest

Manifest-managed extensions can refresh their registered webhooks from the **Extension
webhooks** section of the extension details page. Dashboard also checks the manifest when the
section loads and shows a warning icon when the registered webhooks differ.

This is a best-effort Dashboard feature. It does not change the Saleor API.

## How the refresh works

Dashboard fetches the extension's stored `manifestUrl` in the browser and validates the part of
the manifest needed for webhook refresh. It checks that:

- the manifest identifier matches the installed extension;
- the extension already has every permission requested by the new manifest;
- webhook names are unique; and
- webhook URLs and event names are valid, and subscription queries are syntactically valid.

Webhook names are used as identities, matching the migration logic in the Saleor Apps
repository. Before applying anything, Dashboard fetches the manifest and registered webhooks
again and shows the planned changes for confirmation.

The changes run in this order:

1. Create webhooks that are present only in the manifest.
2. Update matching webhooks in place.
3. Deactivate active webhooks that are no longer present in the manifest.

Dashboard never deletes a webhook during this flow. Deactivation happens last, so renaming a
webhook creates the replacement before the old webhook stops receiving events. Updating in place
also preserves the webhook ID and delivery history.

An existing webhook that was manually disabled stays disabled, even if the manifest says it is
active. A manifest can still disable an active webhook. Custom headers are not part of the app
manifest format, so refresh leaves existing custom headers unchanged.

If a mutation fails, Dashboard stops, reloads the registered webhooks, and reports that some
changes may already have succeeded. It does not try to roll changes back. A retry builds a new
plan from the current state and continues from there.

## Current limitations

The installation screen can fetch a manifest because `appFetchManifest` makes the HTTP request
from Saleor Core. The refresh flow cannot reuse that mutation: Core rejects a manifest whose
identifier is already installed. Calling it a second time fails before Dashboard can use the
returned manifest.

Without a Core change, Dashboard must fetch the manifest directly from the administrator's
browser. This is brittle for several reasons:

- The manifest server must allow the Dashboard origin through CORS. It must also be allowed by
  the browser's content security and mixed-content rules.
- The browser and Saleor Core may have different network access. A private manifest reachable by
  Core may not be reachable by the administrator's computer.
- Core supplies Saleor-specific request context when it reads a manifest. A manifest that changes
  based on request headers, domain, or Saleor version may return different content to Dashboard.
- Dashboard repeats only the manifest validation needed by this feature. That validation can
  drift from Core as the manifest format changes.
- Each create or update is a separate mutation. The operation is not atomic, so concurrent edits
  or a network failure can leave a partly refreshed result. The next retry is designed to be
  idempotent, but it cannot prevent every race.
- Names are the only shared identity. Renaming a webhook looks like creating one webhook and
  retiring another. Duplicate names make a safe plan impossible.
- Core does not record whether a webhook came from the manifest. An app-created or manually
  created webhook that is absent from the manifest looks obsolete and will be offered for
  deactivation. The confirmation screen is the only safeguard for this ambiguity.
- The warning is a point-in-time comparison. The manifest or registered webhooks can change after
  the check and before confirmation.

Because of these limits, failure to read a manifest produces no plan and applies no changes.
Dashboard disables the refresh action and explains the problem in its tooltip. Reloading the page
starts a new manifest check.

## Smallest useful Core change

Extend `appFetchManifest` with an optional installed app ID while keeping its existing arguments
and behavior:

```graphql
appFetchManifest(manifestUrl: String!, appId: ID): AppFetchManifest
```

When `appId` is omitted, the mutation should behave exactly as it does today during installation.
When it is supplied, Core should:

1. require `MANAGE_APPS` as it does today;
2. load the installed app and require `manifestUrl` to match its stored manifest URL;
3. fetch and validate the manifest with the same request context used during installation;
4. require the returned identifier to match that installed app; and
5. allow the identifier uniqueness check only for that same app.

This is additive for existing clients: their query and installation behavior do not change. The
`AppManifestWebhook` GraphQL type would also need to expose the already supported `isActive`
field, so Dashboard can compare and apply the complete manifest webhook definition.

With those two small additions, Dashboard could remove its browser fetch and local manifest
parser. That fixes the CORS, network-context, header, and validation-drift problems. It does not
make the sequence of webhook mutations atomic. A dedicated transactional webhook-sync mutation
would solve that too, but it is a larger API and behavior change rather than the minimum needed
to make this feature dependable.
