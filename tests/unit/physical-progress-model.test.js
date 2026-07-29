const mongoose = require('mongoose');

const PhysicalProgress = require('../../src/models/physical-progress');

function validProgress(overrides = {}) {
  const id = new mongoose.Types.ObjectId();
  return new PhysicalProgress({
    athleteId: id,
    recordedBy: id,
    referenceDate: new Date(),
    weightKg: 80,
    ...overrides,
  });
}

describe('PhysicalProgress model', () => {
  it('usa collection, campos e índices oficiais sem professionalId', () => {
    const indexes = PhysicalProgress.schema.indexes().map(([fields]) => fields);
    expect(PhysicalProgress.collection.name).toBe('physical_progress');
    expect(indexes).toEqual(expect.arrayContaining([
      { athleteId: 1, referenceDate: -1 },
      { athleteId: 1, archivedAt: 1, referenceDate: -1 },
    ]));
    expect(PhysicalProgress.schema.path('professionalId')).toBeUndefined();
    expect(PhysicalProgress.schema.path('recordedBy')).toBeDefined();
  });

  it('aplica defaults e normaliza measurements e notes', async () => {
    const progress = validProgress({ notes: '   ' });
    await expect(progress.validate()).resolves.toBeUndefined();
    expect(progress.notes).toBeNull();
    expect(progress.archivedAt).toBeNull();
    expect(progress.measurements.toObject()).toEqual({
      chestCm: null,
      waistCm: null,
      armCm: null,
      thighCm: null,
      calfCm: null,
    });
  });

  it('rejeita ausência de conteúdo, limites e precisão inválidos', async () => {
    const missingReferenceDate = validProgress();
    missingReferenceDate.referenceDate = undefined;
    await expect(missingReferenceDate.validate()).rejects.toThrow();
    await expect(
      validProgress({ weightKg: null }).validate(),
    ).rejects.toThrow('Informe ao menos um dado');
    await expect(
      validProgress({ weightKg: -1 }).validate(),
    ).rejects.toThrow();
    await expect(
      validProgress({ weightKg: 1000.001 }).validate(),
    ).rejects.toThrow();
    await expect(
      validProgress({ weightKg: 80.1234 }).validate(),
    ).rejects.toThrow('três casas');
    await expect(
      validProgress({ weightKg: null, bodyFatPercent: 100.001 }).validate(),
    ).rejects.toThrow();
  });

  it('aceita conteúdo isolado e no máximo três casas decimais', async () => {
    await expect(
      validProgress({ weightKg: null, notes: ' Registro ' }).validate(),
    ).resolves.toBeUndefined();
    await expect(
      validProgress({ weightKg: 80.123 }).validate(),
    ).resolves.toBeUndefined();
    await expect(
      validProgress({
        weightKg: null,
        measurements: { calfCm: 40.125 },
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it('rejeita propriedades fora do schema', () => {
    expect(
      () => validProgress({ professionalId: new mongoose.Types.ObjectId() }),
    ).toThrow();
  });
});
