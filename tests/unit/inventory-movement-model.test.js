const mongoose = require('mongoose');

const InventoryMovement = require('../../src/models/inventory-movement');

function validMovement(overrides = {}) {
  const id = new mongoose.Types.ObjectId();
  return new InventoryMovement({
    inventoryItemId: id,
    athleteId: id,
    type: 'out',
    quantity: 1,
    previousQuantity: 3,
    resultingQuantity: 2,
    reason: 'Baixa manual.',
    createdBy: id,
    ...overrides,
  });
}

describe('InventoryMovement model', () => {
  it('usa collection, campos e índices oficiais sem updatedAt', () => {
    const indexes = InventoryMovement.schema.indexes().map(([fields]) => fields);
    expect(InventoryMovement.collection.name).toBe('inventory_movements');
    expect(indexes).toEqual(expect.arrayContaining([
      { inventoryItemId: 1, createdAt: -1 },
      { athleteId: 1, createdAt: -1 },
    ]));
    expect(InventoryMovement.schema.path('updatedAt')).toBeUndefined();
    expect(
      InventoryMovement.schema.path('relatedTrackingRecordId'),
    ).toBeUndefined();
  });

  it.each(['in', 'out', 'adjustment'])('aceita o tipo %s', async (type) => {
    const quantity = type === 'adjustment' ? 0 : 1;
    await expect(
      validMovement({ type, quantity }).validate(),
    ).resolves.toBeUndefined();
  });

  it('rejeita zero para in/out, enum, limites, precisão e reason', async () => {
    await expect(validMovement({ quantity: 0 }).validate()).rejects.toThrow();
    await expect(
      validMovement({ type: 'invalid' }).validate(),
    ).rejects.toThrow();
    await expect(
      validMovement({ previousQuantity: -1 }).validate(),
    ).rejects.toThrow();
    await expect(
      validMovement({ resultingQuantity: 1.1234 }).validate(),
    ).rejects.toThrow();
    await expect(validMovement({ reason: 'x' }).validate()).rejects.toThrow();
  });

  it('mantém todos os campos imutáveis após hidratação', () => {
    const original = validMovement().toObject();
    original.createdAt = new Date('2026-01-01T00:00:00.000Z');
    const movement = InventoryMovement.hydrate(original);

    movement.type = 'in';
    movement.quantity = 99;
    movement.previousQuantity = 98;
    movement.resultingQuantity = 197;
    movement.reason = 'Nova razão.';
    movement.createdBy = new mongoose.Types.ObjectId();
    movement.createdAt = new Date('2027-01-01T00:00:00.000Z');

    expect(movement.type).toBe(original.type);
    expect(movement.quantity).toBe(original.quantity);
    expect(movement.previousQuantity).toBe(original.previousQuantity);
    expect(movement.resultingQuantity).toBe(original.resultingQuantity);
    expect(movement.reason).toBe(original.reason);
    expect(movement.createdBy).toEqual(original.createdBy);
    expect(movement.createdAt).toEqual(original.createdAt);
    expect(movement.modifiedPaths()).toEqual([]);
  });
});
