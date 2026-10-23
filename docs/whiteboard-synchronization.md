# Whiteboard synchronization

The classroom board is still scoped to a **class occurrence**, not a permanent
course notebook. Its existing close/reopen/expiry and access rules are unchanged.
`roomName` identifies the content; `expectedLiveRoomName` identifies the current
LiveKit activation. Delayed writes from an earlier activation are rejected.

## Drawings

- Convex remains authoritative. LiveKit carries only ephemeral pointers and viewport
  updates, not durable drawings or images.
- The editor queues changes at an 80 ms maximum scheduling delay while idle. There
  is one batch in flight; newer edits coalesce until it completes. Network latency
  can extend delivery time. Transient failures retry with bounded exponential delay.
- A deterministic hash assigns elements to 64 stable buckets. Each reactive query
  subscribes to one occupied bucket, not the complete scene. Only changed elements
  are sent to mutations; a mutation merges and writes its affected bucket.
- Cursor-aware readers obtain a full snapshot once, then read a separate, bounded
  journal instead of loading the historical bucket for each edit. The journal
  retains at most 32 revisions and 64 KiB of serialized entries per bucket.
  Snapshot and winning journal changes are written in the same transaction.
  Tombstones, order and conflicts use the existing merge rules.
- Anchors remain stable across small deltas to share cached queries, then advance
  from an applied response when its pending journal entries consume half the
  retention window (16 revisions or 32 KiB). The server supplies the checkpoint
  hint; the client validates and merges the response before renewing its cursor.
  This avoids periodic historical downloads for an otherwise up-to-date reader
  without changing subscriptions for every edit. A reload still starts from a
  canonical snapshot, never from a cursor without its in-memory base.
  Cursors bind to both the immutable manifest ID and generation. Missing history,
  another source/generation or a delta larger than the retention window falls
  back to the canonical full snapshot; nothing is truncated. Older clients without
  cursors retain full-bucket reads. Existing scenes need no destructive migration.
- The client retains its parsed base while a cursor subscription is loading, ignores
  older revisions, and requests a fresh snapshot if its base is missing, even when
  another bucket is pending. Cache scope includes room, recording token and manifest.
  Permission checks run for snapshots, deltas and empty results alike.
- The editor mounts only after the initial cloud scene and local draft are resolved.
  A new bucket can temporarily leave an incremental scene incomplete; this is not
  an empty scene or a new initialization. Keep the editor mounted and reconcile
  subsequent complete scenes through its imperative API, preserving tools, local
  edits, viewport, and history for both writers and readers.
- Editor API readiness also triggers that same reconciliation effect. Complete
  scenes arriving during the dynamic import are applied once ready, including
  remote images, without replacing a writer's pending local drawings or using a
  separate reader-only scene buffer.
- Deferred API initialization checks that its API is still current before consuming
  buffered images or marking readiness. StrictMode's discarded constructor must
  not take files intended for the mounted editor.
- Elements retain IDs, versions, nonces, fractional indices, bindings, and deletion
  tombstones. Missing IDs during a reset become tombstones, including when a new
  stroke arrives before the reset is transmitted. Remote editor updates use
  `CaptureUpdateAction.NEVER` to preserve local undo history.
- JSON encoding avoids Convex's nested-array limit for long freehand strokes. Each
  logical bucket is fragmented into documents of at most 128 KiB UTF-8, with an
  8 MiB limit per bucket. Legacy drawings larger than one fragment remain readable
  and editable. This is **bounded**
  storage, not an unlimited canvas: distribution can fill a bucket before the
  aggregate capacity is used. Oversized updates fail atomically and retain the
  pending draft; the UI distinguishes this from a connectivity error.
- A successful merge may reject older local versions. The acknowledgement includes
  only conflicting winning elements. The writer reconciles these before confirming
  its current drawing revision.
- If remote edits arrive during a write, completion confirms the current scene
  only when every revision in it is acknowledged. A newer unsent local edit remains
  pending; an older response cannot confirm it.
- Initialization errors belong to their recovery attempt. A new attempt or a valid
  incremental manifest clears the previous error, while late failures from an old
  activation are ignored. Query permission failures still propagate normally.

## Images and local recovery

- Image uploads use an authenticated HTTP action. The server stores the verified
  body and invokes an internal completion function. Public clients cannot attach
  arbitrary storage IDs. Completion rechecks permissions and the live activation.
- Image IDs are immutable. Retries reuse the existing reference and discard only
  the newly uploaded duplicate. Existing PNG/JPEG/JFIF/WebP/GIF/BMP/ICO/AVIF/SVG support
  is retained. The client limits uploads to two concurrent requests.
- File-map lookups use own-property checks. External IDs such as `constructor`
  and `hasOwnProperty` remain valid: inherited object properties never count as
  uploaded references or cached image binaries. Upload/reload tests cover these
  IDs alongside existing drawings, images, pending drafts, and access checks.
- IndexedDB stores scene metadata and image binaries separately. Drawing updates
  do not rewrite every image. Local writes are scheduled separately at 300 ms and
  retain immutable snapshots. `wb_<roomName>` localStorage drafts remain readable;
  localStorage is a compatibility fallback, not the main per-stroke store.
- Drawing acknowledgement and image acknowledgement are independent. A drawing
  marked saved can still retain image binaries whose upload is pending.
- If both local storage mechanisms reject writes, the previous recoverable draft
  is retained. If the network also fails, **new unsaved edits cannot be guaranteed
  after an abrupt browser/process/device termination**. The UI warns and navigation
  requests confirmation while changes or images remain unconfirmed. Async work
  initiated on page exit is best-effort, never a durability guarantee.

## Compatibility and release

- Initializing an old board copies it transactionally into buckets and retains the
  original snapshot and image references. No destructive migration is run.
- `fromLegacy` preserves the distinction between an existing empty cloud board and
  a board that had no cloud snapshot, needed to recover older local drafts without
  a `saved` flag while respecting confirmed clears.
- Old snapshot writers and arbitrary-storage-ID image uploads receive explicit
  reload/upgrade errors after conversion. Old readers use the compatibility query
  while the scene fits native Convex return limits. Deploy the matching backend
  and frontend together and ask active classrooms to reload; old clients must not
  silently overwrite the new representation.
- Expiry detaches the manifest and schedules bounded bucket cleanup by immutable
  manifest ID, including the recent-change journals. Old cleanup jobs cannot delete
  a replacement manifest's buckets or journals.
- This change does not create course notebooks, change expiry, change recording
  permissions, or optimize camera subscriptions and video quality.

## Verification

Tests cover continuous drawing, partial changes in a 1,000-element scene,
single-flight writes, retry, conflicts, clear/undo, legacy conversion, permissions,
recording-token revocation, real session reopening, delayed responses, quota
failures, and drawing/image recovery. UI tests mock the canvas; they do not prove
physical tablet frame rates. A native Chrome check also verifies IndexedDB recovery
after reload with localStorage writes rejected.

The incremental-subscription regression tests use the real scene hook with a
stateful canvas model. They cover a delayed bucket and write acknowledgement,
continued drawing, delta-only writes without accidental tombstones, reader viewport,
images, and reload when both local stores reject new writes. These tests failed
before the lifecycle correction and pass afterward.

Late-startup tests delay the editor API while remote drawings and an image arrive.
They verify reconciliation with pending local drawings and image uploads, no
rebroadcast of remote elements, read-only isolation, and reload with both local
stores rejecting new writes. The writer case failed before the readiness correction.
Two-API tests also cover StrictMode's discarded constructor for both roles: only
the current editor receives buffered image bytes, pending drawings survive, and
reload still recovers the cloud scene with full local storage.

Run `pnpm audit:whiteboard:browser` with Google Chrome installed. The isolated
localhost harness bundles the real project component and installed Excalidraw
0.18.1 development SDK with exactly one React runtime. It replaces only external
service boundaries and blocks non-local requests; it does not contact production.
The validated browser was Chrome 155.0.8059.85.

The check asserts both real StrictMode API callbacks, images delivered only to
the current API, actual image pixels on the canvas, real mouse strokes, keyboard
undo/redo, no editor remount across delayed bucket reads, and read-only updates
without writes or uploads. It fills actual localStorage to quota, delays remote
acknowledgement, and verifies pending drawings and image bytes survive a page
reload through IndexedDB. It then injects IndexedDB write quota failures (without
filling the disk), confirms that the previous draft remains intact, and verifies
new remotely confirmed drawings survive another reload. Both roles finish with
no uncaught page errors. This is not a physical-tablet performance measurement,
a live Convex/LiveKit integration test, or a guarantee of durability for new
offline edits when both local stores reject writes.

Measure tablet frame time, end-to-end drawing latency, bucket bytes, query executions,
and database I/O before claiming a percentage cost reduction. Faster continuous
delivery can increase call count compared with the old debounce that sent nothing
until a pause; the savings target is less data and repeated work per delivered change.

The reproducible multi-participant load test is `pnpm audit:whiteboard:benchmark`.
See [the measured results and limitations](whiteboard-benchmark.md): desktop readers
received continuous changes; the original 1 Mbps delay fell from 10.5 seconds to
432 ms p95 with cursor reads in the repeated large-scene test. Read traffic during
the twelve strokes fell from about 5 MB to 118 kB per normal reader. This is a
controlled local result, not a production latency or invoice guarantee. Cold load
and the teacher's remaining long tasks still require separate measurement.

Each changed bucket now writes one additional bounded journal document. Smaller
network responses do not, by themselves, prove a lower total Convex invoice.

### Scoped readiness assessment

The bounded revision-read change closes the separately confirmed read-amplification
finding: scoped code readiness **85 → 100** (`100 − 15` before, `100 − 0` after).
Code authz/reviewer passes, retention/fallback tests, differential reads on a
250 kB historical bucket, joint draft/image/concurrency/quota recovery tests and
the repeated real-SDK benchmark cover this case. Advisor/insights on deployed
traffic were skipped; there was no deployment or remote-data mutation. Dependency
updates remain outside this change; no new observability service was added.

The follow-up code audit identified two client lifecycle defects: confirming an
obsolete snapshot after a concurrent remote edit, and retaining an initialization
error after recovery. Both have regression tests, including real-backend recovery,
concurrent writes, full localStorage, IndexedDB recovery, images, and access checks.
For these two findings the code-only score is **90 → 100** under the launch-readiness
rubric: before `100 − 5 − 5`, after `100 − 0`. This scoped score is not a production
certification, an assertion that every optimization is complete, or a tablet
performance benchmark. Live production advisor/log passes were not rerun for this
implementation.

The later incremental-read incident is a separate, confirmed high-severity
client lifecycle finding: remounting the editor could turn retained cloud data
into outgoing deletion tombstones. Its scoped code-only assessment is
**85 → 100** (`100 − 15` before, `100 − 0` after). The affected client, recovery,
and access paths were re-audited; the full suite and the real-SDK local checks
above passed. This score covers that finding only, not production or tablet
performance certification.

The subsequent late-editor-startup finding has a scoped code-only assessment of
**95 → 100** (`100 − 5` before, `100 − 0` after). API readiness now reruns the
existing remote reconciliation for both roles instead of buffering scenes only
for readers. The joint startup tests and independent access/recording review cover
this correction; no backend, permissions, or storage schema changed.
An independent Chrome check with the real 0.18.1 SDK delayed the editor by one
second: both roles and `onReady` received the latest scene, and undo/redo affected
only a subsequent local stroke while preserving the remote drawings and editor.

The development-only StrictMode image-handoff finding is also **95 → 100**
(`100 − 5` before, `100 − 0` after), scoped to that confirmed case. The deferred
callback verifies API identity before consuming files or marking readiness;
the two-callback tests failed before this guard and pass for both roles afterward.

The package metadata check found newer rate-limiter and workflow releases. Neither
was upgraded: dependency upgrades need separate compatibility checks and are not
required by this change. Existing error capture is retained; retry failures are
deduplicated until recovery instead of generating a new report on every retry.
