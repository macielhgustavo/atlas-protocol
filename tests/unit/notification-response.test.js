const toNotificationResponse = require(
  '../../src/utils/notification-response',
);

describe('notification response', () => {
  it('expõe somente o contrato público sem ownership ou campos internos', () => {
    const createdAt = new Date();
    const notification = {
      _id: { toString: () => 'notification-id' },
      userId: 'private-user-id',
      type: 'checkin_reviewed',
      title: 'Check-in revisado',
      message: 'Seu check-in foi revisado.',
      entityType: 'CheckIn',
      entityId: { toString: () => 'entity-id' },
      readAt: null,
      archivedAt: null,
      createdAt,
      __v: 0,
      metadata: { secret: true },
    };

    expect(toNotificationResponse(notification)).toEqual({
      id: 'notification-id',
      type: 'checkin_reviewed',
      title: 'Check-in revisado',
      message: 'Seu check-in foi revisado.',
      entityType: 'CheckIn',
      entityId: 'entity-id',
      readAt: null,
      archivedAt: null,
      createdAt,
    });
  });

  it('normaliza relação ausente para null', () => {
    const response = toNotificationResponse({
      id: 'notification-id',
      type: 'professional_approved',
      title: 'Título',
      message: 'Mensagem',
      createdAt: new Date(),
    });

    expect(response.entityType).toBeNull();
    expect(response.entityId).toBeNull();
  });
});
