const ERROR_CODES = require('../constants/error-codes');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const Notification = require('../models/notification');
const AppError = require('../utils/app-error');
const logger = require('../utils/logger');
const toNotificationResponse = require('../utils/notification-response');
const {
  getNotificationTemplate,
} = require('../utils/notification-templates');
const {
  internalNotificationSchema,
} = require('../validators/notification-validators');

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Notificação não encontrada.',
  );
}

function normalizeId(value) {
  return value === null || value === undefined ? null : value.toString();
}

function normalizeInternalPayload(payload) {
  return {
    ...payload,
    userId: normalizeId(payload.userId),
    entityId: normalizeId(payload.entityId),
  };
}

function internalValidationError(validationError) {
  const error = new AppError(
    500,
    ERROR_CODES.INTERNAL_ERROR,
    'Falha ao criar notificação interna.',
  );
  error.cause = validationError;
  return error;
}

async function createNotification(payload) {
  const { error, value } = internalNotificationSchema.validate(
    normalizeInternalPayload(payload),
    {
      abortEarly: false,
      stripUnknown: false,
    },
  );
  if (error) throw internalValidationError(error);

  return Notification.create(value);
}

function safeErrorCode(error) {
  const code = error && error.code !== undefined
    ? String(error.code)
    : error && error.name;
  if (code && /^[A-Z][A-Z0-9_]*$|^\d+$/u.test(code)) return code;
  return ERROR_CODES.INTERNAL_ERROR;
}

function safeEnumValue(value, enumObject) {
  return Object.values(enumObject).includes(value) ? value : null;
}

async function createNotificationSafely(payload) {
  try {
    return await createNotification(payload);
  } catch (error) {
    logger.error('notification_creation_failed', {
      notificationType: safeEnumValue(payload.type, NOTIFICATION_TYPES),
      entityType: safeEnumValue(
        payload.entityType,
        NOTIFICATION_ENTITY_TYPES,
      ),
      errorCode: safeErrorCode(error),
    });
    return null;
  }
}

async function createNotificationFromTemplateSafely({
  userId,
  type,
  entityType,
  entityId,
}) {
  const template = getNotificationTemplate(type);
  return createNotificationSafely({
    userId,
    type,
    title: template ? template.title : '',
    message: template ? template.message : '',
    entityType,
    entityId,
  });
}

async function listNotifications(userId, query) {
  const filters = {
    userId,
    archivedAt: query.archived ? { $ne: null } : null,
  };
  if (query.read === true) filters.readAt = { $ne: null };
  if (query.read === false) filters.readAt = null;

  const skip = (query.page - 1) * query.limit;
  const [notifications, total] = await Promise.all([
    Notification.find(filters)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit),
    Notification.countDocuments(filters),
  ]);

  return {
    notifications: notifications.map(toNotificationResponse),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

async function markNotificationAsRead(userId, notificationId) {
  const readAt = new Date();
  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      userId,
      readAt: null,
    },
    { $set: { readAt } },
    { new: true, runValidators: true },
  );
  if (notification) return toNotificationResponse(notification);

  const existingNotification = await Notification.findOne({
    _id: notificationId,
    userId,
  });
  if (!existingNotification) throw notFoundError();
  return toNotificationResponse(existingNotification);
}

async function markAllNotificationsAsRead(userId) {
  const readAt = new Date();
  const result = await Notification.updateMany(
    {
      userId,
      archivedAt: null,
      readAt: null,
    },
    { $set: { readAt } },
  );
  return { updatedCount: result.modifiedCount };
}

async function archiveNotification(userId, notificationId) {
  const archivedAt = new Date();
  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      userId,
      archivedAt: null,
    },
    { $set: { archivedAt } },
    { new: true, runValidators: true },
  );
  if (notification) return toNotificationResponse(notification);

  const existingNotification = await Notification.findOne({
    _id: notificationId,
    userId,
  });
  if (!existingNotification) throw notFoundError();
  return toNotificationResponse(existingNotification);
}

module.exports = {
  archiveNotification,
  createNotification,
  createNotificationFromTemplateSafely,
  createNotificationSafely,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
};
