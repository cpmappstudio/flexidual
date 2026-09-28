export const READ_NOTIFICATION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// UI retention only: chat acknowledgements and delivery deduplication remain intact.
export function isNotificationInFeed(
  notification: { readAt?: number },
  now: number,
) {
  return (
    notification.readAt === undefined ||
    notification.readAt + READ_NOTIFICATION_RETENTION_MS > now
  );
}
