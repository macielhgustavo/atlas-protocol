const mongoose = require('mongoose');

const CheckIn = require('../../src/models/check-in');

function createCheckIn(overrides = {}) {
  return new CheckIn({
    athleteId: new mongoose.Types.ObjectId(),
    professionalId: new mongoose.Types.ObjectId(),
    referenceWeek: new Date('2026-08-05T12:00:00.000Z'),
    responses: { notes: 'Registro semanal.' },
    ...overrides,
  });
}

describe('CheckIn model', () => {
  it('define collection, estados, defaults e índices oficiais', () => {
    const checkIn = createCheckIn();

    expect(CheckIn.collection.name).toBe('check_ins');
    expect(checkIn.status).toBe('pending');
    expect(checkIn.protocolId).toBeNull();
    expect(CheckIn.schema.path('status').options.enum).toEqual(
      expect.arrayContaining(['pending', 'submitted', 'reviewed']),
    );
    expect(CheckIn.schema.path('answers')).toBeUndefined();
    expect(CheckIn.schema.path('reopenedAt')).toBeUndefined();
    expect(CheckIn.schema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { athleteId: 1, referenceWeek: 1 },
          expect.objectContaining({ unique: true }),
        ],
        [
          { professionalId: 1, status: 1, referenceWeek: -1 },
          expect.any(Object),
        ],
        [{ protocolId: 1, referenceWeek: -1 }, expect.any(Object)],
      ]),
    );
  });

  it('normaliza referenceWeek antes da validação', async () => {
    const checkIn = createCheckIn();

    await checkIn.validate();

    expect(checkIn.referenceWeek.toISOString()).toBe(
      '2026-08-03T03:00:00.000Z',
    );
  });

  it('rejeita responses fora do contrato', async () => {
    const nested = createCheckIn({
      responses: { nested: { unsafe: true } },
    });
    const forbiddenKey = createCheckIn({
      responses: { '$where': 'return true' },
    });

    await expect(nested.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ responses: expect.any(Object) }),
    });
    await expect(forbiddenKey.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ responses: expect.any(Object) }),
    });
  });

  it('exige submittedAt para submitted e reviewed', async () => {
    await expect(
      createCheckIn({ status: 'submitted' }).validate(),
    ).rejects.toMatchObject({
      errors: expect.objectContaining({ submittedAt: expect.any(Object) }),
    });
    await expect(
      createCheckIn({
        status: 'submitted',
        submittedAt: new Date(),
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it('exige campos de revisão coerentes com o profissional responsável', async () => {
    const professionalId = new mongoose.Types.ObjectId();
    const valid = createCheckIn({
      professionalId,
      status: 'reviewed',
      submittedAt: new Date('2026-08-05T12:00:00.000Z'),
      reviewedAt: new Date('2026-08-05T13:00:00.000Z'),
      reviewedBy: professionalId,
      reviewComment: '  Revisão registrada.  ',
    });
    const wrongReviewer = createCheckIn({
      professionalId,
      status: 'reviewed',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: new mongoose.Types.ObjectId(),
      reviewComment: 'Revisão registrada.',
    });

    await expect(valid.validate()).resolves.toBeUndefined();
    expect(valid.reviewComment).toBe('Revisão registrada.');
    await expect(wrongReviewer.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ reviewedBy: expect.any(Object) }),
    });
  });

  it('rejeita timestamps de envio ou revisão incompatíveis com pending', async () => {
    const checkIn = createCheckIn({
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: new mongoose.Types.ObjectId(),
      reviewComment: 'Comentário indevido.',
    });

    await expect(checkIn.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        reviewComment: expect.any(Object),
        reviewedAt: expect.any(Object),
        reviewedBy: expect.any(Object),
        submittedAt: expect.any(Object),
      }),
    });
  });

  it('rejeita campos históricos e desconhecidos no model', () => {
    expect(
      () =>
        createCheckIn({
          answers: { notes: 'Formato antigo.' },
          reopenedAt: new Date(),
        }),
    ).toThrow(mongoose.Error.StrictModeError);
  });
});
