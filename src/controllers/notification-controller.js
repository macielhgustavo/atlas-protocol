const notificationService = require('../services/notification-service');

async function listNotifications(request, response) {
  const { notifications, meta } = await notificationService.listNotifications(
    request.user.id,
    request.query,
  );
  return response.status(200).json({
    success: true,
    data: notifications,
    meta,
  });
}

async function markNotificationAsRead(request, response) {
  const notification = await notificationService.markNotificationAsRead(
    request.user.id,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: notification,
    message: 'Notificação marcada como lida.',
  });
}

async function markAllNotificationsAsRead(request, response) {
  const result = await notificationService.markAllNotificationsAsRead(
    request.user.id,
  );
  return response.status(200).json({
    success: true,
    data: result,
    message: 'Notificações marcadas como lidas.',
  });
}

async function archiveNotification(request, response) {
  const notification = await notificationService.archiveNotification(
    request.user.id,
    request.params.id,
  );
  return response.status(200).json({
    success: true,
    data: notification,
    message: 'Notificação arquivada com sucesso.',
  });
}

module.exports = {
  archiveNotification,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
};
