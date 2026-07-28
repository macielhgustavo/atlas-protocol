const {
  normalizeReferenceWeek,
  REFERENCE_TIME_ZONE,
} = require('../../src/utils/normalize-reference-week');

describe('normalizeReferenceWeek', () => {
  it('usa America/Sao_Paulo como timezone funcional', () => {
    expect(REFERENCE_TIME_ZONE).toBe('America/Sao_Paulo');
  });

  it('normaliza para segunda-feira à meia-noite em America/Sao_Paulo', () => {
    const normalized = normalizeReferenceWeek('2026-08-05T12:30:00.000Z');

    expect(normalized.toISOString()).toBe('2026-08-03T03:00:00.000Z');
  });

  it('considera o dia local ao redor da virada em UTC', () => {
    const normalized = normalizeReferenceWeek('2026-08-03T01:30:00.000Z');

    expect(normalized.toISOString()).toBe('2026-07-27T03:00:00.000Z');
  });

  it('mantém a semana quando a data já representa a segunda local', () => {
    const normalized = normalizeReferenceWeek(
      new Date('2026-08-03T03:00:00.000Z'),
    );

    expect(normalized.toISOString()).toBe('2026-08-03T03:00:00.000Z');
  });

  it('interpreta ISO date-only como data civil em America/Sao_Paulo', () => {
    const normalized = normalizeReferenceWeek('2026-08-03');

    expect(normalized.toISOString()).toBe('2026-08-03T03:00:00.000Z');
  });

  it('rejeita valores que não representam datas', () => {
    expect(() => normalizeReferenceWeek('data-inválida')).toThrow(RangeError);
    expect(() => normalizeReferenceWeek('2026-02-30')).toThrow(RangeError);
    expect(() => normalizeReferenceWeek(null)).toThrow(RangeError);
  });
});
