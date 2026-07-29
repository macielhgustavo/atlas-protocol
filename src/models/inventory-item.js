const mongoose = require('mongoose');

const INVENTORY_UNITS = require('../constants/inventory-units');

const MAX_QUANTITY = 1_000_000_000;

function hasAtMostThreeDecimals(value) {
  if (value === null || value === undefined) return true;
  const scaled = value * 1000;
  return Math.abs(scaled - Math.round(scaled)) < Number.EPSILON * 1000;
}

function quantityField({ defaultValue, nullable = false, required = false }) {
  const field = {
    type: Number,
    min: 0,
    max: MAX_QUANTITY,
    required,
    validate: [
      {
        validator: (value) =>
          (nullable && value === null) || Number.isFinite(value),
        message: 'O valor deve ser um número finito.',
      },
      {
        validator: hasAtMostThreeDecimals,
        message: 'O valor deve possuir no máximo três casas decimais.',
      },
    ],
  };
  if (defaultValue !== undefined) field.default = defaultValue;
  return field;
}

const inventoryItemSchema = new mongoose.Schema(
  {
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    substanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Substance',
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    unit: {
      type: String,
      enum: Object.values(INVENTORY_UNITS),
      required: true,
    },
    quantity: quantityField({ required: true }),
    lowStockThreshold: quantityField({
      defaultValue: null,
      nullable: true,
    }),
    expirationDate: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  {
    collection: 'inventory_items',
    strict: 'throw',
    timestamps: true,
  },
);

inventoryItemSchema.index({ athleteId: 1, archivedAt: 1 });
inventoryItemSchema.index({ athleteId: 1, expirationDate: 1 });
inventoryItemSchema.index({ athleteId: 1, name: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
module.exports.MAX_QUANTITY = MAX_QUANTITY;
