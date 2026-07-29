const {
  inventoryState,
  toInventoryItemResponse,
  toInventoryMovementResponse,
} = require('../../src/utils/inventory-response');

describe('Inventory response', () => {
  const now = new Date('2026-08-01T12:00:00.000Z');

  it('deriva expired e lowStock sem alterar o item', () => {
    const item = {
      id: 'item-id',
      athleteId: 'athlete-id',
      substanceId: null,
      name: 'Item',
      unit: 'unit',
      quantity: 1,
      lowStockThreshold: 1,
      expirationDate: new Date('2026-08-01T11:59:59.999Z'),
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const response = toInventoryItemResponse(item, now);
    expect(response.expired).toBe(true);
    expect(response.lowStock).toBe(true);
    expect(item).not.toHaveProperty('expired');
    expect(item).not.toHaveProperty('lowStock');
  });

  it('considera validade igual a now não vencida e threshold nulo não baixo', () => {
    expect(
      inventoryState({
        expirationDate: now,
        quantity: 0,
        lowStockThreshold: null,
      }, now),
    ).toEqual({ expired: false, lowStock: false });
  });

  it('retorna exatamente os campos públicos do item', () => {
    const response = toInventoryItemResponse({
      id: 'item-id',
      athleteId: 'athlete-id',
      substanceId: 'substance-id',
      name: 'Item',
      unit: 'box',
      quantity: 2,
      lowStockThreshold: 0,
      expirationDate: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ownerId: 'hidden',
      __v: 1,
    }, now);
    expect(Object.keys(response).sort()).toEqual([
      'archivedAt',
      'athleteId',
      'createdAt',
      'expirationDate',
      'expired',
      'id',
      'lowStock',
      'lowStockThreshold',
      'name',
      'quantity',
      'substanceId',
      'unit',
      'updatedAt',
    ]);
  });

  it('retorna exatamente os campos públicos da movimentação', () => {
    const response = toInventoryMovementResponse({
      id: 'movement-id',
      inventoryItemId: 'item-id',
      athleteId: 'athlete-id',
      type: 'out',
      quantity: 1,
      previousQuantity: 3,
      resultingQuantity: 2,
      reason: 'Baixa manual.',
      createdBy: 'athlete-id',
      createdAt: now,
      __v: 1,
    });
    expect(Object.keys(response).sort()).toEqual([
      'athleteId',
      'createdAt',
      'createdBy',
      'id',
      'inventoryItemId',
      'previousQuantity',
      'quantity',
      'reason',
      'resultingQuantity',
      'type',
    ]);
  });
});
