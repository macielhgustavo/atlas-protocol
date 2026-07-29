const mongoose = require('mongoose');

const MEASUREMENT_FIELDS = [
  'chestCm',
  'waistCm',
  'armCm',
  'thighCm',
  'calfCm',
];

function hasAtMostThreeDecimals(value) {
  if (value === null || value === undefined) return true;
  const scaled = value * 1000;
  return Math.abs(scaled - Math.round(scaled)) < Number.EPSILON * 1000;
}

function nullableNumber(max) {
  return {
    type: Number,
    default: null,
    min: 0,
    max,
    validate: [
      {
        validator: (value) => value === null || Number.isFinite(value),
        message: 'O valor deve ser um número finito.',
      },
      {
        validator: hasAtMostThreeDecimals,
        message: 'O valor deve possuir no máximo três casas decimais.',
      },
    ],
  };
}

const measurementsSchema = new mongoose.Schema(
  Object.fromEntries(
    MEASUREMENT_FIELDS.map((field) => [field, nullableNumber(1000)]),
  ),
  { _id: false, strict: 'throw' },
);

const physicalProgressSchema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    referenceDate: { type: Date, required: true },
    weightKg: nullableNumber(1000),
    bodyFatPercent: nullableNumber(100),
    measurements: {
      type: measurementsSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 2000,
      default: null,
      set: (value) =>
        typeof value === 'string' && value.trim() === '' ? null : value,
    },
    archivedAt: { type: Date, default: null },
  },
  { collection: 'physical_progress', strict: 'throw', timestamps: true },
);

physicalProgressSchema.pre('validate', function validateMeaningfulContent(next) {
  const hasMeasurement = MEASUREMENT_FIELDS.some(
    (field) => this.measurements?.[field] !== null &&
      this.measurements?.[field] !== undefined,
  );
  const hasContent =
    this.weightKg !== null ||
    this.bodyFatPercent !== null ||
    hasMeasurement ||
    this.notes !== null;

  if (!hasContent) {
    this.invalidate(
      'content',
      'Informe ao menos um dado de evolução ou observação.',
    );
  }
  next();
});

physicalProgressSchema.index({ athleteId: 1, referenceDate: -1 });
physicalProgressSchema.index({
  athleteId: 1,
  archivedAt: 1,
  referenceDate: -1,
});

module.exports = mongoose.model('PhysicalProgress', physicalProgressSchema);
