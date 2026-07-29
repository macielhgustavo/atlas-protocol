const mongoose = require('mongoose');

const InventoryItem = require('../../src/models/inventory-item');

function validItem(overrides = {}) {
  return new InventoryItem({
    athleteId: new mongoose.Types.ObjectId(),
    name: 'Item',
    unit: 'unit',
    quantity: 10,
    ...overrides,
  });
}

describe('InventoryItem model', () => {
  it('usa collection, campos e índices oficiais', () => {
    const indexes = InventoryItem.schema.indexes().map(([fields]) => fields);
    expect(InventoryItem.collection.name).toBe('inventory_items');
    expect(indexes).toEqual(expect.arrayContaining([
      { athleteId: 1, archivedAt: 1 },
      { athleteId: 1, expirationDate: 1 },
      { athleteId: 1, name: 1 },
    ]));
    for (const field of [
      'athleteId',
      'substanceId',
      'name',
      'unit',
      'quantity',
      'lowStockThreshold',
      'expirationDate',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ]) {
      expect(InventoryItem.schema.path(field)).toBeDefined();
    }
  });

  it('não possui campos legados ou estados derivados persistidos', () => {
    for (const field of [
      'ownerId',
      'brand',
      'batch',
      'status',
      'expired',
      'lowStock',
      'supplier',
      'cost',
    ]) {
      expect(InventoryItem.schema.path(field)).toBeUndefined();
    }
  });

  it('aplica defaults anuláveis', async () => {
    const item = validItem();
    await expect(item.validate()).resolves.toBeUndefined();
    expect(item.substanceId).toBeNull();
    expect(item.lowStockThreshold).toBeNull();
    expect(item.expirationDate).toBeNull();
    expect(item.archivedAt).toBeNull();
  });

  it.each(['unit', 'ml', 'mg', 'g', 'capsule', 'tablet', 'vial', 'box'])(
    'aceita a unidade oficial %s',
    async (unit) => {
      await expect(validItem({ unit }).validate()).resolves.toBeUndefined();
    },
  );

  it('rejeita unidade, limites, infinito e precisão inválidos', async () => {
    await expect(validItem({ unit: 'units' }).validate()).rejects.toThrow();
    await expect(validItem({ quantity: -1 }).validate()).rejects.toThrow();
    await expect(
      validItem({ quantity: 1_000_000_000.001 }).validate(),
    ).rejects.toThrow();
    await expect(
      validItem({ quantity: 1.1234 }).validate(),
    ).rejects.toThrow('três casas');
    await expect(
      validItem({ lowStockThreshold: Number.POSITIVE_INFINITY }).validate(),
    ).rejects.toThrow();
  });

  it('aceita zero, três casas e data passada', async () => {
    await expect(
      validItem({
        quantity: 0,
        lowStockThreshold: 0.125,
        expirationDate: new Date('2020-01-01T00:00:00.000Z'),
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it('rejeita propriedades fora do schema', () => {
    expect(() => validItem({ ownerId: new mongoose.Types.ObjectId() })).toThrow();
  });
});
