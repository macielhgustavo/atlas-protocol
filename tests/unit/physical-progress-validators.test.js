const {
  archivePhysicalProgressSchema,
  createPhysicalProgressSchema,
  physicalProgressListQuerySchema,
  updatePhysicalProgressSchema,
} = require('../../src/validators/physical-progress-validators');

function validateCreate(payload) {
  return createPhysicalProgressSchema.validate(payload, {
    abortEarly: false,
    stripUnknown: false,
  });
}

describe('PhysicalProgress validators', () => {
  it.each([
    ['weightKg', { weightKg: 80 }],
    ['bodyFatPercent', { bodyFatPercent: 12.5 }],
    ['measurements', { measurements: { armCm: 35.123 } }],
    ['notes', { notes: ' Registro descritivo. ' }],
  ])('aceita conteúdo significativo somente em %s', (_field, content) => {
    const { error } = validateCreate({
      referenceDate: '2026-08-01T00:00:00.000Z',
      ...content,
    });
    expect(error).toBeUndefined();
  });

  it.each([
    {},
    { measurements: {} },
    { weightKg: null, bodyFatPercent: null, notes: ' ' },
    { measurements: { armCm: null } },
  ])('rejeita criação sem conteúdo significativo', (content) => {
    const { error } = validateCreate({
      referenceDate: '2026-08-01T00:00:00.000Z',
      ...content,
    });
    expect(error).toBeDefined();
  });

  it.each([
    { weightKg: '80.5' },
    { weightKg: Number.NaN },
    { weightKg: Number.POSITIVE_INFINITY },
    { weightKg: -1 },
    { weightKg: 1000.001 },
    { weightKg: 80.1234 },
    { bodyFatPercent: 100.001 },
    { measurements: { waistCm: '80' } },
    { measurements: { waistCm: [] } },
    { measurements: { waistCm: { nested: true } } },
    { measurements: { unknown: 1 } },
    { recordedBy: '507f1f77bcf86cd799439011' },
  ])('rejeita tipo, limite ou campo inválido %#', (content) => {
    const { error } = validateCreate({
      referenceDate: '2026-08-01T00:00:00.000Z',
      notes: 'válido',
      ...content,
    });
    expect(error).toBeDefined();
  });

  it('PATCH e archive são estritos', () => {
    expect(updatePhysicalProgressSchema.validate({}).error).toBeDefined();
    expect(
      updatePhysicalProgressSchema.validate({ measurements: {} }).error,
    ).toBeDefined();
    expect(
      updatePhysicalProgressSchema.validate({
        measurements: { waistCm: null },
      }).error,
    ).toBeUndefined();
    expect(
      updatePhysicalProgressSchema.validate({ notes: '   ' }).value.notes,
    ).toBeNull();
    expect(
      updatePhysicalProgressSchema.validate({ athleteId: 'x' }).error,
    ).toBeDefined();
    expect(archivePhysicalProgressSchema.validate({}).error).toBeUndefined();
    expect(
      archivePhysicalProgressSchema.validate({ reason: 'x' }).error,
    ).toBeDefined();
  });

  it('valida filtros, intervalo e whitelist de ordenação', () => {
    const valid = physicalProgressListQuerySchema.validate({});
    expect(valid.error).toBeUndefined();
    expect(valid.value).toMatchObject({
      archived: false,
      page: 1,
      limit: 20,
      sortBy: 'referenceDate',
      sortOrder: 'desc',
    });
    expect(
      physicalProgressListQuerySchema.validate({
        dateFrom: '2026-08-02',
        dateTo: '2026-08-01',
      }).error,
    ).toBeDefined();
    expect(
      physicalProgressListQuerySchema.validate({ sortBy: 'weightKg' }).error,
    ).toBeDefined();
    expect(
      physicalProgressListQuerySchema.validate({ archived: 'all' }).error,
    ).toBeDefined();
  });

  it.each(['__proto__', 'prototype', 'constructor', '$value', 'waist.cm'])(
    'rejeita chave perigosa %s em measurements',
    (field) => {
      const measurements = JSON.parse(`{"${field}": 1}`);
      const { error } = validateCreate({
        referenceDate: '2026-08-01T00:00:00.000Z',
        notes: 'Registro.',
        measurements,
      });
      expect(error).toBeDefined();
    },
  );
});
