const mongoose = require('mongoose');

const NOTIFICATION_ENTITY_TYPES = require(
  '../../src/constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require(
  '../../src/constants/notification-types',
);
const Notification = require('../../src/models/notification');

function validNotification(overrides = {}) {
  return new Notification({
    userId: new mongoose.Types.ObjectId(),
    type: NOTIFICATION_TYPES.LINK_REQUESTED,
    title: 'Nova solicitação de vínculo',
    message: 'Você recebeu uma solicitação de vínculo profissional.',
    entityType: NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
    entityId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

describe('Notification model', () => {
  it('usa collection, defaults e timestamps definidos no contrato', () => {
    const notification = validNotification();

    expect(Notification.collection.collectionName).toBe('notifications');
    expect(notification.readAt).toBeNull();
    expect(notification.archivedAt).toBeNull();
    expect(Notification.schema.path('createdAt')).toBeDefined();
    expect(Notification.schema.path('updatedAt')).toBeUndefined();
    expect(Notification.schema.options.strict).toBe('throw');
  });

  it('declara somente os dois índices oficiais', () => {
    expect(Notification.schema.indexes()).toEqual([
      [
        { userId: 1, readAt: 1, createdAt: -1 },
        { background: true },
      ],
      [
        { userId: 1, archivedAt: 1, createdAt: -1 },
        { background: true },
      ],
    ]);
  });

  it('restringe type e entityType aos enums oficiais', () => {
    expect(Notification.schema.path('type').options.enum).toEqual(
      Object.values(NOTIFICATION_TYPES),
    );
    expect(Notification.schema.path('entityType').options.enum).toEqual([
      ...Object.values(NOTIFICATION_ENTITY_TYPES),
      null,
    ]);
  });

  it('exige entityType e entityId em conjunto', async () => {
    await expect(
      validNotification({ entityId: null }).validate(),
    ).rejects.toThrow('entityType e entityId');
    await expect(
      validNotification({ entityType: null }).validate(),
    ).rejects.toThrow('entityType e entityId');
    await expect(
      validNotification({ entityType: null, entityId: null }).validate(),
    ).resolves.toBeUndefined();
  });

  it('aplica trim, limites e bloqueio de HTML', async () => {
    const notification = validNotification({
      title: '  Título  ',
      message: '  Mensagem  ',
    });
    await notification.validate();
    expect(notification.title).toBe('Título');
    expect(notification.message).toBe('Mensagem');

    await expect(
      validNotification({ title: 'x'.repeat(161) }).validate(),
    ).rejects.toThrow();
    await expect(
      validNotification({ message: 'x'.repeat(501) }).validate(),
    ).rejects.toThrow();
    await expect(
      validNotification({ message: '<script>x</script>' }).validate(),
    ).rejects.toThrow('HTML');
  });

  it('rejeita propriedades desconhecidas', () => {
    expect(
      () => validNotification({ payload: { unsafe: true } }),
    ).toThrow(/strict mode/u);
  });
});
