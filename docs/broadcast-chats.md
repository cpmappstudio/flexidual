# Broadcast chats

Broadcasts are conversations, not courses. `broadcasts` owns the audience and
settings; `broadcastWriters` contains only explicitly selected professors and
their participation setting. Students are resolved from current institutional
memberships and grades, never copied into an enrollment or recipient table.

The modes use the same institution/campus scope as course live access:
`school` reaches the institution; `private` reaches its selected campus.
Students in selected grades can read, but never write. All professors in that
scope can read; only selected, enabled professors can write. Administrative
permissions follow existing institution/campus management permissions. Tutors
are not included. Broadcasts are independent of course-end archival.

The existing message, attachment, pin, moderation and read-receipt engine is
shared. Historical table and API names remain compatible with course callers.
Every message/attachment has exactly one target (`classId` or `broadcastId`),
validated at the API boundary. Course-only task references and live-session
access stay on the course branch. No existing records need a migration.

Lists and teacher selection are paginated. Broadcast name search uses Convex's
search index within the institution. The same multiple combobox is used to
create and edit professor participants, with the existing people directory's
server search and pagination. In institutional broadcasts, campus selection
only filters the directory; selected professors persist across campus changes.
Participant edits apply additions/removals rather than replacing a stale list;
existing individual mutes are preserved. Removal revokes writing and pending
uploads, not scope-based reading or existing messages/files.

Notification delivery is scheduled in
bounded batches, indexed by organization, role and grade; legacy memberships
without a grade are checked against the existing profile fallback. A canonical
eligible membership avoids redundant deliveries across campus/role memberships.
An indexed per-message receipt prevents duplicate counts if that membership
changes during delivery. Receipts and unread counts commit atomically; receipts
are removed in bounded batches when their message is cleared.
The existing singleton notification/read watermark is reused. Access is checked
again on reads, uploads, upload completion, sending and notification display.

Private attachments retain the existing authenticated HTTP flow, validation,
quotas, expiration and cleanup. Archival retains messages/files; clearing uses
the existing bounded deletion flow. A campus with broadcasts cannot be deleted
while those records are linked, consistent with courses and memberships.
