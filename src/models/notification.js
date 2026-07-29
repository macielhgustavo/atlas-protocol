const mongoose = require('mongoose');

const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');

function doesNotContainHtml(value) {
  return !/<[^>]*>/u.test(value);
}

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
      immutable: true,
      validate: {
        validator: doesNotContainHtml,
        message: 'O título não pode conter HTML.',
      },
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
      immutable: true,
      validate: {
        validator: doesNotContainHtml,
        message: 'A mensagem não pode conter HTML.',
      },
    },
    entityType: {
      type: String,
      enum: [...Object.values(NOTIFICATION_ENTITY_TYPES), null],
      default: null,
      immutable: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'notifications',
    strict: 'throw',
    timestamps: { createdAt: true, updatedAt: false },
  },
);

notificationSchema.pre('validate', function validateEntityPair(next) {
  const hasEntityType = this.entityType !== null && this.entityType !== undefined;
  const hasEntityId = this.entityId !== null && this.entityId !== undefined;
  if (hasEntityType !== hasEntityId) {
    this.invalidate(
      hasEntityType ? 'entityId' : 'entityType',
      'entityType e entityId devem ser informados em conjunto.',
    );
  }
  next();
});

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, archivedAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
