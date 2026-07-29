const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema(
  {
    marker: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    value: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    unit: { type: String, trim: true, minlength: 1, maxlength: 80, default: null },
    referenceRange: {
      type: String,
      trim: true,
      minlength: 1,
      maxlength: 240,
      default: null,
    },
  },
  { _id: false, strict: 'throw' },
);

const documentSchema = new mongoose.Schema(
  {
    storageKey: { type: String, required: true, select: false },
    url: { type: String, default: null, select: false },
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: ['application/pdf'] },
    sizeBytes: { type: Number, required: true, min: 1 },
  },
  { _id: false, strict: 'throw' },
);

const examSchema = new mongoose.Schema(
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
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 160 },
    examDate: { type: Date, required: true },
    laboratory: { type: String, trim: true, minlength: 1, maxlength: 160, default: null },
    results: {
      type: [resultSchema],
      default: [],
      validate: {
        validator: (results) => results.length <= 100,
        message: 'Um exame aceita no máximo 100 resultados.',
      },
    },
    document: { type: documentSchema, default: null },
    notes: { type: String, trim: true, minlength: 1, maxlength: 2000, default: null },
    archivedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  { collection: 'exams', strict: 'throw', timestamps: true },
);

examSchema.index({ athleteId: 1, examDate: -1 });
examSchema.index({ athleteId: 1, archivedAt: 1 });

module.exports = mongoose.model('Exam', examSchema);
