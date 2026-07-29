const HISTORY_EVENT_TYPES = require(
  '../../src/constants/history-event-types',
);
const {
  historyQuerySchema,
} = require('../../src/validators/history-validators');

describe('history validators', () => {
  it('aplica paginação padrão e aceita os seis tipos oficiais', () => {
    const defaults = historyQuerySchema.validate({});
    expect(defaults.error).toBeUndefined();
    expect(defaults.value).toEqual({ page: 1, limit: 20 });

    for (const type of Object.values(HISTORY_EVENT_TYPES)) {
      expect(historyQuerySchema.validate({ type }).error).toBeUndefined();
    }
    expect(Object.values(HISTORY_EVENT_TYPES)).toHaveLength(6);
    expect(historyQuerySchema.validate({ limit: 100 }).error).toBeUndefined();
  });

  it.each([
    { type: 'link' },
    { type: ['exam', 'progress'] },
    { limit: 101 },
    { page: 0 },
    { sortBy: 'occurredAt' },
    { sortOrder: 'desc' },
    { status: 'active' },
    { professionalId: '507f1f77bcf86cd799439011' },
    { archived: true },
    { unknown: true },
  ])('rejeita query fora da whitelist %#', (query) => {
    expect(historyQuerySchema.validate(query).error).toBeDefined();
  });

  it('valida ObjectId e intervalo temporal', () => {
    expect(
      historyQuerySchema.validate({ athleteId: 'inválido' }).error,
    ).toBeDefined();
    expect(
      historyQuerySchema.validate({
        dateFrom: '2026-08-02T00:00:00.000Z',
        dateTo: '2026-08-01T00:00:00.000Z',
      }).error,
    ).toBeDefined();
    expect(
      historyQuerySchema.validate({
        dateFrom: '2026-08-01T00:00:00.000Z',
        dateTo: '2026-08-02T00:00:00.000Z',
      }).error,
    ).toBeUndefined();
  });
});
