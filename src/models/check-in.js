const mongoose = require('mongoose');

const CHECK_IN_STATUSES = require('../constants/check-in-statuses');
const { validateResponses } = require('../utils/check-in-responses');
const { normalizeReferenceWeek } = require('../utils/normalize-reference-week');

function submittedAtMatchesStatus(value) {
  const hasValue = value !== null && value !== undefined;
  return this.status === CHECK_IN_STATUSES.PENDING ? !hasValue : hasValue;
}

function reviewFieldMatchesStatus(value) {
  const hasValue = value !== null && value !== undefined;
  return this.status === CHECK_IN_STATUSES.REVIEWED ? hasValue : !hasValue;
}

function reviewedByMatchesProfessional(value) {
  if (this.status !== CHECK_IN_STATUSES.REVIEWED) return value === null;
  return (
    value &&
    this.professionalId &&
    value.toString() === this.professionalId.toString()
  );
}

const checkInSchema = new mongoose.Schema(
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
      required: true,
      immutable: true,
    },
    protocolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Protocol',
      default: null,
      immutable: true,
    },
    referenceWeek: {
      type: Date,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: Object.values(CHECK_IN_STATUSES),
      default: CHECK_IN_STATUSES.PENDING,
      required: true,
    },
    responses: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      validate: {
        validator(value) {
          return validateResponses(value) === null;
        },
        message: 'responses não respeita o contrato de check-ins.',
      },
    },
    submittedAt: {
      type: Date,
      default: null,
      validate: {
        validator: submittedAtMatchesStatus,
        message: 'submittedAt deve corresponder ao status do check-in.',
      },
    },
    reviewedAt: {
      type: Date,
      default: null,
      validate: {
        validator: reviewFieldMatchesStatus,
        message: 'reviewedAt deve ser informado apenas em check-ins revisados.',
      },
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      validate: [
        {
          validator: reviewFieldMatchesStatus,
          message: 'reviewedBy deve ser informado apenas em check-ins revisados.',
        },
        {
          validator: reviewedByMatchesProfessional,
          message: 'reviewedBy deve identificar o profissional responsável.',
        },
      ],
    },
    reviewComment: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 2000,
      default: null,
      validate: {
        validator: reviewFieldMatchesStatus,
        message:
          'reviewComment deve ser informado apenas em check-ins revisados.',
      },
    },
  },
  {
    collection: 'check_ins',
    strict: 'throw',
    timestamps: true,
  },
);

checkInSchema.pre('validate', function normalizeWeek() {
  if (this.referenceWeek) {
    this.referenceWeek = normalizeReferenceWeek(this.referenceWeek);
  }
});

checkInSchema.index({ athleteId: 1, referenceWeek: 1 }, { unique: true });
checkInSchema.index({ professionalId: 1, status: 1, referenceWeek: -1 });
checkInSchema.index({ protocolId: 1, referenceWeek: -1 });

module.exports = mongoose.model('CheckIn', checkInSchema);
