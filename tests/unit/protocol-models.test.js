const mongoose = require('mongoose');

const Protocol = require('../../src/models/protocol');
const ProtocolVersion = require('../../src/models/protocol-version');

const APPEND_ONLY_ERROR =
  'statusHistory é append-only e só pode receber novas entradas.';

function createHistoryEntry(overrides = {}) {
  return {
    from: null,
    to: 'draft',
    reason: null,
    changedAt: new Date('2026-08-01T12:00:00.000Z'),
    changedBy: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

function createProtocol(overrides = {}) {
  const professionalId =
    overrides.professionalId || new mongoose.Types.ObjectId();
  const statusHistory =
    overrides.statusHistory === undefined
      ? [createHistoryEntry({ changedBy: professionalId })]
      : overrides.statusHistory;

  return new Protocol({
    athleteId: new mongoose.Types.ObjectId(),
    professionalId,
    title: 'Protocolo teste',
    status: 'draft',
    currentVersion: 1,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    continuous: true,
    statusHistory,
    ...overrides,
  });
}

describe('models de protocolo', () => {
  describe('Protocol', () => {
    it('define estados, versão inicial, statusHistory e índices', () => {
      expect(Protocol.schema.path('status').options.enum).toEqual(
        expect.arrayContaining([
          'draft',
          'active',
          'paused',
          'closed',
          'cancelled',
        ]),
      );
      expect(Protocol.schema.path('currentVersion').options.default).toBe(1);

      const historySchema = Protocol.schema.path('statusHistory').schema;
      expect(historySchema.path('from').options.immutable).toBe(true);
      expect(historySchema.path('to').options.immutable).toBe(true);
      expect(historySchema.path('reason').options).toMatchObject({
        immutable: true,
        maxlength: 500,
      });
      expect(historySchema.path('changedAt').options.immutable).toBe(true);
      expect(historySchema.path('changedBy').options.immutable).toBe(true);

      expect(Protocol.schema.indexes()).toEqual(
        expect.arrayContaining([
          [{ athleteId: 1, status: 1 }, expect.any(Object)],
          [{ professionalId: 1, status: 1 }, expect.any(Object)],
          [{ athleteId: 1, createdAt: -1 }, expect.any(Object)],
        ]),
      );
    });

    it('exige a entrada inicial null -> draft', async () => {
      const withoutHistory = createProtocol({ statusHistory: [] });
      const professionalId = new mongoose.Types.ObjectId();
      const wrongInitialEntry = createProtocol({
        professionalId,
        status: 'active',
        statusHistory: [
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            changedBy: professionalId,
          }),
        ],
      });

      await expect(withoutHistory.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({ statusHistory: expect.any(Object) }),
      });
      await expect(wrongInitialEntry.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({ statusHistory: expect.any(Object) }),
      });
    });

    it.each([
      ['reason não nulo', { reason: 'Motivo indevido.' }],
      ['changedBy diferente do professionalId', {
        changedBy: new mongoose.Types.ObjectId(),
      }],
    ])('rejeita entrada inicial com %s', async (_case, entryOverrides) => {
      const professionalId = new mongoose.Types.ObjectId();
      const protocol = createProtocol({
        professionalId,
        statusHistory: [
          createHistoryEntry({ changedBy: professionalId, ...entryOverrides }),
        ],
      });

      await expect(protocol.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({ statusHistory: expect.any(Object) }),
      });
    });

    it('aceita uma sequência completa de transições válidas e normaliza reason', async () => {
      const changedBy = new mongoose.Types.ObjectId();
      const protocol = createProtocol({
        professionalId: changedBy,
        status: 'closed',
        statusHistory: [
          createHistoryEntry({ changedBy }),
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
            changedBy,
          }),
          createHistoryEntry({
            from: 'active',
            to: 'paused',
            reason: '  Pausa operacional.  ',
            changedAt: new Date('2026-08-03T12:00:00.000Z'),
            changedBy,
          }),
          createHistoryEntry({
            from: 'paused',
            to: 'active',
            changedAt: new Date('2026-08-04T12:00:00.000Z'),
            changedBy,
          }),
          createHistoryEntry({
            from: 'active',
            to: 'closed',
            changedAt: new Date('2026-08-05T12:00:00.000Z'),
            changedBy,
          }),
        ],
      });

      await expect(protocol.validate()).resolves.toBeUndefined();
      expect(protocol.statusHistory[2].reason).toBe('Pausa operacional.');
      expect(protocol.statusHistory[3].reason).toBeNull();
    });

    it.each([
      {
        name: 'transição não permitida',
        status: 'paused',
        history: [
          createHistoryEntry(),
          createHistoryEntry({
            from: 'draft',
            to: 'paused',
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
          }),
        ],
      },
      {
        name: 'origem que não corresponde ao estado anterior',
        status: 'closed',
        history: [
          createHistoryEntry(),
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
          }),
          createHistoryEntry({
            from: 'paused',
            to: 'closed',
            changedAt: new Date('2026-08-03T12:00:00.000Z'),
          }),
        ],
      },
      {
        name: 'ordem cronológica regressiva',
        status: 'active',
        history: [
          createHistoryEntry({
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
          }),
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            changedAt: new Date('2026-08-01T12:00:00.000Z'),
          }),
        ],
      },
      {
        name: 'status atual diferente da última transição',
        status: 'paused',
        history: [
          createHistoryEntry(),
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
          }),
        ],
      },
    ])('rejeita $name', async ({ status, history }) => {
      const protocol = createProtocol({
        professionalId: history[0].changedBy,
        status,
        statusHistory: history,
      });

      await expect(protocol.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({ statusHistory: expect.any(Object) }),
      });
    });

    it('limita reason a 500 caracteres', async () => {
      const professionalId = new mongoose.Types.ObjectId();
      const protocol = createProtocol({
        professionalId,
        status: 'active',
        statusHistory: [
          createHistoryEntry({ changedBy: professionalId }),
          createHistoryEntry({
            from: 'draft',
            to: 'active',
            reason: 'a'.repeat(501),
            changedAt: new Date('2026-08-02T12:00:00.000Z'),
            changedBy: professionalId,
          }),
        ],
      });

      await expect(protocol.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({
          'statusHistory.1.reason': expect.any(Object),
        }),
      });
    });

    it('impede substituir statusHistory por save mesmo com sequência válida', async () => {
      const protocol = createProtocol();
      protocol.isNew = false;
      protocol.status = 'active';
      protocol.statusHistory = [
        createHistoryEntry({ changedBy: protocol.professionalId }),
        createHistoryEntry({
          from: 'draft',
          to: 'active',
          changedAt: new Date('2026-08-02T12:00:00.000Z'),
          changedBy: protocol.professionalId,
        }),
      ];

      await expect(protocol.save()).rejects.toThrow(APPEND_ONLY_ERROR);
    });

    it.each([
      ['$set', { $set: { statusHistory: [] } }],
      ['$unset', { $unset: { statusHistory: 1 } }],
      ['$pull', { $pull: { statusHistory: { to: 'draft' } } }],
      ['$pop', { $pop: { statusHistory: 1 } }],
    ])('impede mutação de statusHistory por query com %s', async (_name, update) => {
      await expect(
        Protocol.updateOne({ _id: new mongoose.Types.ObjectId() }, update),
      ).rejects.toThrow(APPEND_ONLY_ERROR);
    });

    it('impede alterar status por query sem append atômico no histórico', async () => {
      await expect(
        Protocol.updateOne(
          { _id: new mongoose.Types.ObjectId(), status: 'draft' },
          { $set: { status: 'active' } },
        ),
      ).rejects.toThrow(APPEND_ONLY_ERROR);
    });

    it('impede aggregation pipeline que possa contornar os guards', async () => {
      await expect(
        Protocol.updateOne(
          { _id: new mongoose.Types.ObjectId() },
          [{ $set: { status: 'active', statusHistory: [] } }],
        ),
      ).rejects.toThrow(APPEND_ONLY_ERROR);
    });

    it('permite a operação atômica autorizada de status e histórico', async () => {
      const protocolId = new mongoose.Types.ObjectId();
      const professionalId = new mongoose.Types.ObjectId();
      const changedAt = new Date('2026-08-02T12:00:00.000Z');
      const collectionSpy = jest
        .spyOn(Protocol.collection, 'findOneAndUpdate')
        .mockResolvedValue(null);

      try {
        await expect(
          Protocol.findOneAndUpdate(
            { _id: protocolId, status: 'draft' },
            {
              $set: { status: 'active', activatedAt: changedAt },
              $push: {
                statusHistory: {
                  from: 'draft',
                  to: 'active',
                  reason: null,
                  changedAt,
                  changedBy: professionalId,
                },
              },
            },
            { new: true, runValidators: true },
          ).allowAtomicStatusTransition(),
        ).resolves.toBeNull();
        expect(collectionSpy).toHaveBeenCalledTimes(1);
      } finally {
        collectionSpy.mockRestore();
      }
    });

    it('impede substituição integral do protocolo por query', async () => {
      await expect(
        Protocol.replaceOne(
          { _id: new mongoose.Types.ObjectId() },
          createProtocol().toObject(),
        ),
      ).rejects.toThrow(APPEND_ONLY_ERROR);
    });
  });

  describe('ProtocolVersion', () => {
    it('define unicidade sequencial e snapshot obrigatório', async () => {
      expect(ProtocolVersion.schema.indexes()).toEqual(
        expect.arrayContaining([
          [
            { protocolId: 1, version: 1 },
            expect.objectContaining({ unique: true }),
          ],
        ]),
      );

      const version = new ProtocolVersion({
        protocolId: new mongoose.Types.ObjectId(),
        version: 1,
        createdBy: new mongoose.Types.ObjectId(),
        startDate: new Date(),
        continuous: true,
        items: [
          {
            substanceId: new mongoose.Types.ObjectId(),
            frequencyType: 'daily',
          },
        ],
      });

      await expect(version.validate()).rejects.toMatchObject({
        errors: expect.objectContaining({
          'items.0.substanceSnapshot': expect.any(Object),
        }),
      });
    });

    it('mantém somente os campos documentados no schema de versão e itens', () => {
      const versionSchemaPaths = ProtocolVersion.schema.paths;
      const itemSchema = ProtocolVersion.schema.path('items').schema;

      expect(versionSchemaPaths).toEqual(
        expect.objectContaining({
          protocolId: expect.any(Object),
          version: expect.any(Object),
          createdBy: expect.any(Object),
          changeReason: expect.any(Object),
          startDate: expect.any(Object),
          endDate: expect.any(Object),
          continuous: expect.any(Object),
          items: expect.any(Object),
          createdAt: expect.any(Object),
        }),
      );
      expect(versionSchemaPaths.title).toBeUndefined();
      expect(versionSchemaPaths.objective).toBeUndefined();

      for (const field of [
        'substanceId',
        'substanceSnapshot',
        'instructions',
        'frequencyType',
        'weekDays',
        'time',
        'startDate',
        'endDate',
        'active',
      ]) {
        expect(itemSchema.path(field)).toBeDefined();
      }

      for (const undocumentedField of [
        'dosage',
        'unit',
        'frequency',
        'schedule',
        'notes',
      ]) {
        expect(itemSchema.path(undocumentedField)).toBeUndefined();
      }
    });

    it('protege as regras de weekDays também no model', async () => {
      function createVersion(frequencyType, weekDays) {
        return new ProtocolVersion({
          protocolId: new mongoose.Types.ObjectId(),
          version: 1,
          createdBy: new mongoose.Types.ObjectId(),
          startDate: new Date(),
          continuous: true,
          items: [
            {
              substanceId: new mongoose.Types.ObjectId(),
              substanceSnapshot: {
                name: 'Item de teste',
                category: 'supplement',
              },
              frequencyType,
              weekDays,
            },
          ],
        });
      }

      await expect(
        createVersion('weekly', [1, 7]).validate(),
      ).resolves.toBeUndefined();

      for (const [frequencyType, weekDays, errorPath] of [
        ['weekly', [], 'items.0.weekDays'],
        ['weekly', [0], 'items.0.weekDays.0'],
        ['weekly', [8], 'items.0.weekDays.0'],
        ['daily', [1], 'items.0.weekDays'],
      ]) {
        await expect(
          createVersion(frequencyType, weekDays).validate(),
        ).rejects.toMatchObject({
          errors: expect.objectContaining({
            [errorPath]: expect.any(Object),
          }),
        });
      }
    });
  });
});
