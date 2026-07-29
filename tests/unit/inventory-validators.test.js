const {
  archiveInventoryItemSchema,
  createInventoryItemSchema,
  createInventoryMovementSchema,
  inventoryListQuerySchema,
  inventoryMovementListQuerySchema,
  updateInventoryItemSchema,
} = require('../../src/validators/inventory-validators');

function validItem(overrides = {}) {
  return {
    name: 'Item',
    unit: 'unit',
    quantity: 3,
    ...overrides,
  };
}

describe('Inventory validators', () => {
  it('aceita limites, nulls e precisão de três casas', () => {
    const { error, value } = createInventoryItemSchema.validate(validItem({
      substanceId: null,
      quantity: 0,
      lowStockThreshold: 0.125,
      expirationDate: null,
    }));
    expect(error).toBeUndefined();
    expect(value.name).toBe('Item');
  });

  it.each([
    { quantity: '3' },
    { quantity: Number.NaN },
    { quantity: Number.POSITIVE_INFINITY },
    { quantity: Number.NEGATIVE_INFINITY },
    { quantity: -1 },
    { quantity: 1_000_000_000.001 },
    { quantity: 1.1234 },
    { quantity: {} },
    { quantity: [] },
    { lowStockThreshold: '1' },
  ])('rejeita quantidade inválida %#', (override) => {
    expect(
      createInventoryItemSchema.validate(validItem(override)).error,
    ).toBeDefined();
  });

  it.each([
    'unidade',
    'units',
    'mililitro',
    'comprimido',
    'ampola',
    'caixa',
  ])('rejeita alias de unidade %s', (unit) => {
    expect(
      createInventoryItemSchema.validate(validItem({ unit })).error,
    ).toBeDefined();
  });

  it('normaliza strings e rejeita campos controlados', () => {
    const valid = createInventoryItemSchema.validate(validItem({
      name: '  Item cadastrado  ',
    }));
    expect(valid.value.name).toBe('Item cadastrado');

    for (const field of [
      'athleteId',
      'ownerId',
      'brand',
      'batch',
      'archivedAt',
      'status',
      'expired',
      'lowStock',
      'createdBy',
    ]) {
      const payload = validItem({ [field]: 'value' });
      expect(createInventoryItemSchema.validate(payload).error).toBeDefined();
    }
  });

  it.each(['prototype', 'constructor', '$set', 'name.value'])(
    'rejeita chave perigosa %s',
    (field) => {
      const payload = JSON.parse(
        `{"name":"Item","unit":"unit","quantity":1,"${field}":"x"}`,
      );
      expect(createInventoryItemSchema.validate(payload).error).toBeDefined();
    },
  );

  it('PATCH aceita somente metadados e exige ao menos um campo', () => {
    expect(updateInventoryItemSchema.validate({ name: ' Novo ' }).error)
      .toBeUndefined();
    expect(updateInventoryItemSchema.validate({ substanceId: null }).error)
      .toBeUndefined();
    expect(updateInventoryItemSchema.validate({}).error).toBeDefined();
    expect(updateInventoryItemSchema.validate({ quantity: 1 }).error)
      .toBeDefined();
    expect(updateInventoryItemSchema.validate({ athleteId: 'x' }).error)
      .toBeDefined();
  });

  it('archive exige objeto vazio', () => {
    expect(archiveInventoryItemSchema.validate({}).error).toBeUndefined();
    expect(archiveInventoryItemSchema.validate([]).error).toBeDefined();
    expect(
      archiveInventoryItemSchema.validate({ reason: 'x' }).error,
    ).toBeDefined();
  });

  it('valida semântica, zero e reason dos movimentos', () => {
    expect(createInventoryMovementSchema.validate({
      type: 'adjustment',
      quantity: 0,
      reason: 'Contagem manual.',
    }).error).toBeUndefined();
    for (const payload of [
      { type: 'in', quantity: 0, reason: 'Entrada.' },
      { type: 'out', quantity: 0, reason: 'Saída.' },
      { type: 'in', quantity: '1', reason: 'Entrada.' },
      { type: 'other', quantity: 1, reason: 'Entrada.' },
      { type: 'out', quantity: 1, reason: '  ' },
      { type: 'out', quantity: 1, reason: 'ab' },
      { type: 'out', quantity: 1, reason: 'x'.repeat(501) },
      {
        type: 'out',
        quantity: 1,
        reason: 'Baixa.',
        previousQuantity: 3,
      },
    ]) {
      expect(createInventoryMovementSchema.validate(payload).error).toBeDefined();
    }
  });

  it('valida filtros e whitelist da listagem de itens', () => {
    expect(inventoryListQuerySchema.validate({}).value).toMatchObject({
      archived: false,
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(
      inventoryListQuerySchema.validate({
        expired: 'true',
        lowStock: 'false',
      }).value,
    ).toMatchObject({ expired: true, lowStock: false });
    for (const query of [
      { expired: '1' },
      { lowStock: 'yes' },
      { archived: 'all' },
      { limit: 101 },
      { sortBy: 'athleteId' },
      { sortOrder: 'sideways' },
      { unknown: true },
    ]) {
      expect(inventoryListQuerySchema.validate(query).error).toBeDefined();
    }
  });

  it('valida filtros, período e ordenação das movimentações', () => {
    expect(inventoryMovementListQuerySchema.validate({}).value).toMatchObject({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });
    expect(
      inventoryMovementListQuerySchema.validate({
        dateFrom: '2026-08-02',
        dateTo: '2026-08-01',
      }).error,
    ).toBeDefined();
    expect(
      inventoryMovementListQuerySchema.validate({ sortBy: 'createdAt' }).error,
    ).toBeDefined();
    expect(
      inventoryMovementListQuerySchema.validate({ type: 'invalid' }).error,
    ).toBeDefined();
  });
});
