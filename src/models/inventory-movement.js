const mongoose = require('mongoose');

const INVENTORY_MOVEMENT_TYPES = require(
  '../constants/inventory-movement-types',
);

const MAX_QUANTITY = 1_000_000_000;

function hasAtMostThreeDecimals(value) {
  const scaled = value * 1000;
  return Math.abs(scaled - Math.round(scaled)) < Number.EPSILON * 1000;
}

function immutableQuantityField() {
  return {
    type: Number,
    required: true,
    min: 0,
    max: MAX_QUANTITY,
    immutable: true,
    validate: [
      {
        validator: Number.isFinite,
        message: 'O valor deve ser um número finito.',
      },
      {
        validator: hasAtMostThreeDecimals,
        message: 'O valor deve possuir no máximo três casas decimais.',
      },
    ],
  };
}

const inventoryMovementSchema = new mongoose.Schema(
  {
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true,
      immutable: true,
    },
    athleteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: Object.values(INVENTORY_MOVEMENT_TYPES),
      required: true,
      immutable: true,
    },
    quantity: immutableQuantityField(),
    previousQuantity: immutableQuantityField(),
    resultingQuantity: immutableQuantityField(),
    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 500,
      immutable: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
  },
  {
    collection: 'inventory_movements',
    strict: 'throw',
    timestamps: { createdAt: true, updatedAt: false },
  },
);

inventoryMovementSchema.pre('validate', function validateMovementQuantity(next) {
  if (
    this.type !== INVENTORY_MOVEMENT_TYPES.ADJUSTMENT &&
    !(this.quantity > 0)
  ) {
    this.invalidate('quantity', 'Entradas e saídas exigem quantidade positiva.');
  }
  next();
});

inventoryMovementSchema.index({ inventoryItemId: 1, createdAt: -1 });
inventoryMovementSchema.index({ athleteId: 1, createdAt: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
