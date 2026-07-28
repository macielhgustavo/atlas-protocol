const {
  correctTrackingRecordSchema,
  createTrackingRecordSchema,
  trackingRecordListQuerySchema,
  transitionTrackingRecordSchema,
} = require('../../src/validators/tracking-record-validators');

const objectId = '507f1f77bcf86cd799439011';

function validCreatePayload(overrides = {}) {
  return {
    athleteId: objectId,
    type: 'manual',
    title: 'Registro de acompanhamento',
    scheduledFor: '2026-08-05T11:00:00.000Z',
    ...overrides,
  };
}

describe('tracking record validators', () => {
  it('valida criação e rejeita campos controlados pelo backend', () => {
    expect(createTrackingRecordSchema.validate(validCreatePayload()).error).toBeUndefined();
    expect(
      createTrackingRecordSchema.validate(
        validCreatePayload({
          professionalId: objectId,
          createdBy: objectId,
          protocolItemId: 'legado',
        }),
      ).error,
    ).toBeDefined();
  });

  it('exige type, título e scheduledFor válidos', () => {
    const { error } = createTrackingRecordSchema.validate(
      {
        type: 'invalid',
        title: 'x',
        scheduledFor: 'data-inválida',
      },
      { abortEarly: false },
    );

    expect(error).toBeDefined();
    expect(error.details.map((detail) => detail.path[0])).toEqual(
      expect.arrayContaining(['type', 'title', 'scheduledFor']),
    );
  });

  it('aplica filtros e ordenação oficiais com defaults', () => {
    const { error, value } = trackingRecordListQuerySchema.validate({});

    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      page: 1,
      limit: 20,
      sortBy: 'scheduledFor',
      sortOrder: 'asc',
    });

    for (const invalidQuery of [
      { sortBy: 'updatedAt' },
      { from: '2026-08-01T00:00:00.000Z' },
      { to: '2026-08-02T00:00:00.000Z' },
      { professionalId: objectId },
      {
        dateFrom: '2026-08-03T00:00:00.000Z',
        dateTo: '2026-08-02T00:00:00.000Z',
      },
    ]) {
      expect(
        trackingRecordListQuerySchema.validate(invalidQuery).error,
      ).toBeDefined();
    }
  });

  it('valida payload específico de cada transição', () => {
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'completed',
        completedAt: '2026-08-05T11:10:00.000Z',
        notes: 'Concluído.',
      }).error,
    ).toBeUndefined();
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'missed',
        reason: ' Não realizado. ',
      }).value.reason,
    ).toBe('Não realizado.');
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'cancelled',
      }).error,
    ).toBeDefined();
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'completed',
        reason: 'Campo incompatível.',
      }).error,
    ).toBeDefined();
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'missed',
        completedAt: '2026-08-05T11:10:00.000Z',
      }).error,
    ).toBeDefined();
    expect(
      transitionTrackingRecordSchema.validate({
        status: 'scheduled',
      }).error,
    ).toBeUndefined();
  });

  it('exige notes e reason na correção e normaliza o motivo', () => {
    const valid = correctTrackingRecordSchema.validate({
      notes: 'Texto corrigido.',
      reason: ' Erro de digitação. ',
    });

    expect(valid.error).toBeUndefined();
    expect(valid.value.reason).toBe('Erro de digitação.');
    expect(
      correctTrackingRecordSchema.validate({ notes: 'Sem motivo.' }).error,
    ).toBeDefined();
    expect(
      correctTrackingRecordSchema.validate({
        reason: 'Sem conteúdo corrigido.',
      }).error,
    ).toBeDefined();
  });
});
