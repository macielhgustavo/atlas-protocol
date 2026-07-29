const {
  emptyNotificationBodySchema,
  internalNotificationSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
} = require('../../src/validators/notification-validators');
const {
  findDangerousKey,
} = require('../../src/middlewares/validation-middleware');

const id = '507f1f77bcf86cd799439011';

describe('notification validators', () => {
  it('normaliza paginação e archived padrão', () => {
    const result = notificationListQuerySchema.validate({});

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({
      archived: false,
      page: 1,
      limit: 20,
    });
  });

  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('aceita booleano estrito %p', (input, expected) => {
    const result = notificationListQuerySchema.validate({
      read: input,
      archived: input,
    });

    expect(result.error).toBeUndefined();
    expect(result.value.read).toBe(expected);
    expect(result.value.archived).toBe(expected);
  });

  it.each(['1', 'yes', 1, null])('rejeita booleano inválido %p', (value) => {
    expect(
      notificationListQuerySchema.validate({ read: value }).error,
    ).toBeDefined();
  });

  it('rejeita paginação fora do limite e filtros desconhecidos', () => {
    expect(
      notificationListQuerySchema.validate({ page: 0 }).error,
    ).toBeDefined();
    expect(
      notificationListQuerySchema.validate({ limit: 101 }).error,
    ).toBeDefined();
    expect(
      notificationListQuerySchema.validate({ userId: id }).error,
    ).toBeDefined();
    expect(
      notificationListQuerySchema.validate({ sortBy: 'createdAt' }).error,
    ).toBeDefined();
  });

  it('valida params ObjectId e body rigorosamente vazio', () => {
    expect(notificationIdParamsSchema.validate({ id }).error).toBeUndefined();
    expect(
      notificationIdParamsSchema.validate({ id: 'invalid' }).error,
    ).toBeDefined();
    expect(emptyNotificationBodySchema.validate({}).error).toBeUndefined();
    expect(
      emptyNotificationBodySchema.validate({ read: true }).error,
    ).toBeDefined();
  });

  it('valida payload interno, enums, HTML e par de entidade', () => {
    const valid = {
      userId: id,
      type: 'tracking_created',
      title: 'Novo acompanhamento registrado',
      message: 'Um novo acompanhamento foi registrado.',
      entityType: 'TrackingRecord',
      entityId: id,
    };

    expect(internalNotificationSchema.validate(valid).error).toBeUndefined();
    expect(
      internalNotificationSchema.validate({
        ...valid,
        type: 'generic',
      }).error,
    ).toBeDefined();
    expect(
      internalNotificationSchema.validate({
        ...valid,
        entityId: null,
      }).error,
    ).toBeDefined();
    expect(
      internalNotificationSchema.validate({
        ...valid,
        title: '<strong>Alerta</strong>',
      }).error,
    ).toBeDefined();
    expect(
      internalNotificationSchema.validate({
        ...valid,
        payload: {},
      }).error,
    ).toBeDefined();
  });

  it('middleware transversal identifica propriedades perigosas', () => {
    const dangerous = JSON.parse('{"nested":{"$where":"x"}}');
    expect(findDangerousKey(dangerous)).toBe('nested.$where');
  });
});
