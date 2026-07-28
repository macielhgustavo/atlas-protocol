const mongoose = require('mongoose');

const {
  toActiveProtocol,
  toActivityItem,
  toCurrentCheckIn,
  toNextTracking,
  toRecentAudit,
  toUpcomingTracking,
} = require('../../src/utils/dashboard-response');

describe('serialização segura do dashboard', () => {
  const id = () => new mongoose.Types.ObjectId();

  it('reduz os cards do atleta sem conteúdo completo', () => {
    const professionalId = id();
    const protocolId = id();
    const protocol = toActiveProtocol({
      _id: protocolId,
      title: 'Protocolo',
      status: 'active',
      professionalId,
      currentVersion: 2,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: null,
      continuous: true,
      activatedAt: new Date('2026-08-02T00:00:00.000Z'),
      statusHistory: [{ reason: 'não expor' }],
    });
    const tracking = toNextTracking({
      _id: id(),
      title: 'Acompanhamento',
      type: 'scheduled',
      scheduledFor: new Date('2026-08-03T00:00:00.000Z'),
      status: 'scheduled',
      protocolId,
      professionalId,
      notes: 'não expor',
      statusReason: 'não expor',
    });
    const checkIn = toCurrentCheckIn({
      _id: id(),
      professionalId,
      protocolId: null,
      referenceWeek: new Date('2026-08-03T03:00:00.000Z'),
      status: 'reviewed',
      submittedAt: new Date('2026-08-08T00:00:00.000Z'),
      reviewedAt: new Date('2026-08-09T00:00:00.000Z'),
      responses: { private: true },
      reviewComment: 'não expor',
    });

    expect(Object.keys(protocol)).toEqual([
      'id',
      'title',
      'status',
      'professionalId',
      'currentVersion',
      'startDate',
      'endDate',
      'continuous',
      'activatedAt',
    ]);
    expect(tracking).not.toHaveProperty('notes');
    expect(tracking).not.toHaveProperty('statusReason');
    expect(checkIn).not.toHaveProperty('responses');
    expect(checkIn).not.toHaveProperty('reviewComment');
  });

  it('reduz listas profissionais, atividade e auditoria', () => {
    const athleteId = id();
    const entityId = id();
    const tracking = toUpcomingTracking({
      _id: entityId,
      athleteId,
      protocolId: null,
      title: 'Acompanhamento',
      type: 'manual',
      scheduledFor: new Date(),
      status: 'scheduled',
      notes: 'não expor',
    });
    const activity = toActivityItem(
      {
        _id: entityId,
        athleteId,
        type: 'tracking',
        title: 'Acompanhamento atualizado',
        occurredAt: new Date(),
        status: 'completed',
        responses: { private: true },
      },
      true,
    );
    const audit = toRecentAudit({
      _id: id(),
      actorId: null,
      action: 'USER_BLOCKED',
      entityType: 'User',
      entityId,
      createdAt: new Date(),
      metadata: { reason: 'não expor' },
      ipHash: 'não expor',
    });

    expect(tracking).not.toHaveProperty('notes');
    expect(activity).toMatchObject({
      id: `tracking:${entityId}`,
      entityId: entityId.toString(),
      athleteId: athleteId.toString(),
    });
    expect(activity).not.toHaveProperty('responses');
    expect(audit).not.toHaveProperty('metadata');
    expect(audit).not.toHaveProperty('ipHash');
  });

  it('retorna null para cards singulares ausentes', () => {
    expect(toActiveProtocol(null)).toBeNull();
    expect(toNextTracking(null)).toBeNull();
    expect(toCurrentCheckIn(null)).toBeNull();
  });
});
