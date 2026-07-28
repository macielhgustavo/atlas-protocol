const mongoose = require('mongoose');

const TRACKING_RECORD_STATUSES = require('../constants/tracking-record-statuses');
const TRACKING_RECORD_TYPES = require('../constants/tracking-record-types');

function sameObjectId(left, right) {
  return Boolean(
    left &&
      right &&
      left.toString() === right.toString(),
  );
}

const trackingRecordSchema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    professionalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      immutable: true,
    },
    protocolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Protocol',
      default: null,
      immutable: true,
    },
    protocolVersion: {
      type: Number,
      min: 1,
      default: null,
      immutable: true,
      validate: {
        validator(value) {
          return value === null || Number.isInteger(value);
        },
        message: 'protocolVersion deve ser um número inteiro.',
      },
    },
    type: {
      type: String,
      enum: Object.values(TRACKING_RECORD_TYPES),
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 160,
      immutable: true,
    },
    scheduledFor: {
      type: Date,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: Object.values(TRACKING_RECORD_STATUSES),
      default: TRACKING_RECORD_STATUSES.SCHEDULED,
      required: true,
    },
    statusReason: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 500,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'tracking_records',
    strict: 'throw',
    timestamps: true,
  },
);

trackingRecordSchema.pre('validate', function validateTrackingRecord(next) {
  const hasProfessional = this.professionalId !== null;
  const hasProtocol = this.protocolId !== null;
  const hasProtocolVersion = this.protocolVersion !== null;
  const hasStatusReason = this.statusReason !== null;
  const hasCompletedAt = this.completedAt !== null;
  const hasCompletedBy = this.completedBy !== null;

  if (hasProfessional) {
    if (!sameObjectId(this.createdBy, this.professionalId)) {
      this.invalidate(
        'createdBy',
        'createdBy deve identificar o profissional responsável.',
      );
    }
  } else {
    if (this.type !== TRACKING_RECORD_TYPES.MANUAL) {
      this.invalidate(
        'type',
        'Tracking sem profissional deve possuir o tipo manual.',
      );
    }
    if (!sameObjectId(this.createdBy, this.athleteId)) {
      this.invalidate(
        'createdBy',
        'Tracking manual do atleta deve ser criado pelo próprio atleta.',
      );
    }
  }

  if (hasProtocol !== hasProtocolVersion) {
    this.invalidate(
      'protocolVersion',
      'protocolId e protocolVersion devem ser informados em conjunto.',
    );
  }
  if (hasProtocol && !hasProfessional) {
    this.invalidate(
      'professionalId',
      'Tracking vinculado a protocolo deve possuir profissional.',
    );
  }

  if (this.status === TRACKING_RECORD_STATUSES.SCHEDULED) {
    if (hasStatusReason || hasCompletedAt || hasCompletedBy) {
      this.invalidate(
        'status',
        'Tracking agendado não pode possuir dados de finalização.',
      );
    }
  }

  if (this.status === TRACKING_RECORD_STATUSES.COMPLETED) {
    if (!hasCompletedAt) {
      this.invalidate(
        'completedAt',
        'completedAt é obrigatório para tracking concluído.',
      );
    }
    if (!hasCompletedBy) {
      this.invalidate(
        'completedBy',
        'completedBy é obrigatório para tracking concluído.',
      );
    }
    if (hasStatusReason) {
      this.invalidate(
        'statusReason',
        'Tracking concluído não pode possuir statusReason.',
      );
    }
  }

  if (
    this.status === TRACKING_RECORD_STATUSES.MISSED ||
    this.status === TRACKING_RECORD_STATUSES.CANCELLED
  ) {
    if (!hasStatusReason) {
      this.invalidate(
        'statusReason',
        'statusReason é obrigatório para tracking perdido ou cancelado.',
      );
    }
    if (hasCompletedAt || hasCompletedBy) {
      this.invalidate(
        'status',
        'Tracking perdido ou cancelado não pode possuir dados de conclusão.',
      );
    }
  }

  next();
});

trackingRecordSchema.index({ athleteId: 1, scheduledFor: 1 });
trackingRecordSchema.index({ protocolId: 1, status: 1 });
trackingRecordSchema.index({ athleteId: 1, status: 1, scheduledFor: 1 });

module.exports = mongoose.model('TrackingRecord', trackingRecordSchema);
