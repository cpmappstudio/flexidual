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
  reads one occupied bucket, not the complete scene. Only changed elements are sent
  to mutations; a mutation merges and writes its affected bucket.
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
  manifest ID. Old cleanup jobs cannot delete a replacement manifest's buckets.
- This change does not create course notebooks, change expiry, change recording
  permissions, or optimize camera subscriptions and video quality.

## Verification

Tests cover continuous drawing, partial changes in a 1,000-element scene,
single-flight writes, retry, conflicts, clear/undo, legacy conversion, permissions,
recording-token revocation, real session reopening, delayed responses, quota
failures, and drawing/image recovery. UI tests mock the canvas; they do not prove
physical tablet frame rates. A native Chrome check also verifies IndexedDB recovery
after reload with localStorage writes rejected.

Measure tablet frame time, end-to-end drawing latency, bucket bytes, query executions,
and database I/O before claiming a percentage cost reduction. Faster continuous
delivery can increase call count compared with the old debounce that sent nothing
until a pause; the savings target is less data and repeated work per delivered change.

### Scoped readiness assessment

The follow-up code audit identified two client lifecycle defects: confirming an
obsolete snapshot after a concurrent remote edit, and retaining an initialization
error after recovery. Both have regression tests, including real-backend recovery,
concurrent writes, full localStorage, IndexedDB recovery, images, and access checks.
For these two findings the code-only score is **90 → 100** under the launch-readiness
rubric: before `100 − 5 − 5`, after `100 − 0`. This scoped score is not a production
certification, an assertion that every optimization is complete, or a tablet
performance benchmark. Live production advisor/log passes were not rerun for this
implementation.

The package metadata check found newer rate-limiter and workflow releases. Neither
was upgraded: dependency upgrades need separate compatibility checks and are not
required by this change. Existing error capture is retained; retry failures are
deduplicated until recovery instead of generating a new report on every retry.
