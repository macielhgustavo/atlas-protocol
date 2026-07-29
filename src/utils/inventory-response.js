function toId(value) {
  return value ? value.toString() : null;
}

function inventoryState(item, now) {
  const expirationDate = item.expirationDate
    ? new Date(item.expirationDate)
    : null;
  return {
    expired: Boolean(expirationDate && expirationDate < now),
    lowStock: Boolean(
      item.lowStockThreshold !== null &&
        item.lowStockThreshold !== undefined &&
        item.quantity <= item.lowStockThreshold,
    ),
  };
}

function toInventoryItemResponse(item, now = new Date()) {
  const state = inventoryState(item, now);
  return {
    id: item.id || toId(item._id),
    athleteId: toId(item.athleteId),
    substanceId: toId(item.substanceId),
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    lowStockThreshold: item.lowStockThreshold ?? null,
    expirationDate: item.expirationDate ?? null,
    archivedAt: item.archivedAt ?? null,
    lowStock: state.lowStock,
    expired: state.expired,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toInventoryMovementResponse(movement) {
  return {
    id: movement.id || toId(movement._id),
    inventoryItemId: toId(movement.inventoryItemId),
    athleteId: toId(movement.athleteId),
    type: movement.type,
    quantity: movement.quantity,
    previousQuantity: movement.previousQuantity,
    resultingQuantity: movement.resultingQuantity,
    reason: movement.reason,
    createdBy: toId(movement.createdBy),
    createdAt: movement.createdAt,
  };
}

module.exports = {
  inventoryState,
  toInventoryItemResponse,
  toInventoryMovementResponse,
};
