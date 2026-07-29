function toId(value) {
  return value ? value.toString() : null;
}

function toNotificationResponse(notification) {
  return {
    id: notification.id || toId(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    entityType: notification.entityType ?? null,
    entityId: toId(notification.entityId),
    readAt: notification.readAt ?? null,
    archivedAt: notification.archivedAt ?? null,
    createdAt: notification.createdAt,
  };
}

module.exports = toNotificationResponse;
