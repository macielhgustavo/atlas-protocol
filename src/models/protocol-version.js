const mongoose = require('mongoose');

const PROTOCOL_FREQUENCY_TYPES = require('../constants/protocol-frequency-types');

const substanceSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
  },
  { _id: false },
);

const protocolItemSchema = new mongoose.Schema({
  substanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Substance',
    required: true,
  },
  substanceSnapshot: { type: substanceSnapshotSchema, required: true },
  instructions: { type: String, trim: true, maxlength: 1000, default: null },
  frequencyType: {
    type: String,
    enum: Object.values(PROTOCOL_FREQUENCY_TYPES),
    required: true,
  },
  weekDays: {
    type: [{ type: Number, min: 1, max: 7 }],
    default: [],
    validate: [
      {
        validator(values) {
          return new Set(values).size === values.length;
        },
        message: 'weekDays não pode conter valores duplicados.',
      },
      {
        validator(values) {
          return (
            this.frequencyType !== PROTOCOL_FREQUENCY_TYPES.WEEKLY ||
            values.length > 0
          );
        },
        message:
          'Informe ao menos um dia da semana para frequência semanal.',
      },
      {
        validator(values) {
          return (
            this.frequencyType === PROTOCOL_FREQUENCY_TYPES.WEEKLY ||
            values.length === 0
          );
        },
        message: 'weekDays deve estar vazio para frequências não semanais.',
      },
    ],
  },
  time: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: null },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  active: { type: Boolean, default: true },
});

const protocolVersionSchema = new mongoose.Schema(
  {
    protocolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Protocol',
      required: true,
    },
    version: { type: Number, required: true, min: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changeReason: { type: String, trim: true, maxlength: 500, default: null },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    continuous: { type: Boolean, required: true },
    items: { type: [protocolItemSchema], default: [] },
  },
  {
    collection: 'protocol_versions',
    timestamps: { createdAt: true, updatedAt: false },
  },
);

protocolVersionSchema.index({ protocolId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('ProtocolVersion', protocolVersionSchema);
