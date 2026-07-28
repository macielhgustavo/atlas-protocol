const mongoose = require('mongoose');

const TrackingRecord = require('../../src/models/tracking-record');

function createTrackingRecord(overrides = {}) {
  const professionalId = new mongoose.Types.ObjectId();
  return new TrackingRecord({
    athleteId: new mongoose.Types.ObjectId(),
    professionalId,
    protocolId: null,
    protocolVersion: null,
    type: 'manual',
    title: 'Registro de acompanhamento',
    scheduledFor: new Date('2026-08-05T11:00:00.000Z'),
    status: 'scheduled',
    statusReason: null,
    completedAt: null,
    completedBy: null,
    notes: null,
    createdBy: professionalId,
    ...overrides,
  });
}

describe('TrackingRecord model', () => {
  it('define collection, campos, enums e índices oficiais', () => {
    const paths = TrackingRecord.schema.paths;

    expect(TrackingRecord.collection.name).toBe('tracking_records');
    expect(paths.professionalId.options.required).not.toBe(true);
    expect(paths.status.options.enum).toEqual(
      expect.arrayContaining(['scheduled', 'completed', 'missed', 'cancelled']),
    );
    expect(paths.type.options.enum).toEqual(['manual', 'scheduled']);
    expect(paths.createdBy.options.required).toBe(true);
    expect(paths.statusReason).toBeDefined();
    expect(paths.protocolItemId).toBeUndefined();
    expect(TrackingRecord.schema.indexes()).toEqual(
      expect.arrayContaining([
        [{ athleteId: 1, scheduledFor: 1 }, expect.any(Object)],
        [{ protocolId: 1, status: 1 }, expect.any(Object)],
        [
          { athleteId: 1, status: 1, scheduledFor: 1 },
          expect.any(Object),
        ],
      ]),
    );
  });

  it('aceita tracking manual próprio do atleta sem profissional', async () => {
    const athleteId = new mongoose.Types.ObjectId();
    const trackingRecord = createTrackingRecord({
      athleteId,
      professionalId: null,
      type: 'manual',
      createdBy: athleteId,
    });

    await expect(trackingRecord.validate()).resolves.toBeUndefined();
  });

  it('exige contexto coerente entre criador, profissional e protocolo', async () => {
    const athleteId = new mongoose.Types.ObjectId();
    const invalidAthleteRecord = createTrackingRecord({
      athleteId,
      professionalId: null,
      type: 'scheduled',
      protocolId: new mongoose.Types.ObjectId(),
      protocolVersion: null,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invalidProfessionalRecord = createTrackingRecord({
      createdBy: new mongoose.Types.ObjectId(),
    });

    await expect(invalidAthleteRecord.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        createdBy: expect.any(Object),
        professionalId: expect.any(Object),
        protocolVersion: expect.any(Object),
        type: expect.any(Object),
      }),
    });
    await expect(invalidProfessionalRecord.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        createdBy: expect.any(Object),
      }),
    });
  });

  it('mantém coerência dos campos para status completed', async () => {
    const completedBy = new mongoose.Types.ObjectId();
    const valid = createTrackingRecord({
      status: 'completed',
      completedAt: new Date('2026-08-05T11:10:00.000Z'),
      completedBy,
    });
    const missingCompletion = createTrackingRecord({ status: 'completed' });
    const withReason = createTrackingRecord({
      status: 'completed',
      completedAt: new Date('2026-08-05T11:10:00.000Z'),
      completedBy,
      statusReason: 'Não deveria existir.',
    });

    await expect(valid.validate()).resolves.toBeUndefined();
    await expect(missingCompletion.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        completedAt: expect.any(Object),
        completedBy: expect.any(Object),
      }),
    });
    await expect(withReason.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        statusReason: expect.any(Object),
      }),
    });
  });

  it.each(['missed', 'cancelled'])(
    'exige statusReason e rejeita conclusão em %s',
    async (status) => {
      const missingReason = createTrackingRecord({ status });
      const withCompletion = createTrackingRecord({
        status,
        statusReason: 'Motivo válido.',
        completedAt: new Date('2026-08-05T11:10:00.000Z'),
        completedBy: new mongoose.Types.ObjectId(),
      });
      const valid = createTrackingRecord({
        status,
        statusReason: 'Motivo válido.',
      });

      await expect(missingReason.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({
          statusReason: expect.any(Object),
        }),
      });
      await expect(withCompletion.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({
          status: expect.any(Object),
        }),
      });
      await expect(valid.validate()).resolves.toBeUndefined();
    },
  );

  it('rejeita dados de finalização em scheduled e campos desconhecidos', async () => {
    const withFinalData = createTrackingRecord({
      completedAt: new Date(),
      completedBy: new mongoose.Types.ObjectId(),
    });

    await expect(withFinalData.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        status: expect.any(Object),
      }),
    });
    expect(
      () =>
        new TrackingRecord({
          athleteId: new mongoose.Types.ObjectId(),
          professionalId: null,
          type: 'manual',
          title: 'Registro manual',
          scheduledFor: new Date(),
          createdBy: new mongoose.Types.ObjectId(),
          protocolItemId: 'campo-legado',
        }),
    ).toThrow(mongoose.Error.StrictModeError);
  });
});
