const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const NOTIFICATION_ENTITY_TYPES = require(
  '../../src/constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require(
  '../../src/constants/notification-types',
);
const AuditLog = require('../../src/models/audit-log');
const Notification = require('../../src/models/notification');
const ProfessionalProfile = require('../../src/models/professional-profile');
const User = require('../../src/models/user');
const { generateToken } = require('../../src/utils/jwt');

let mongoServer;

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

async function createUser(role = 'athlete', overrides = {}) {
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash: 'hash-for-notification-tests',
    role,
    ...overrides,
  });
  return user;
}

async function createProfessional(verificationStatus) {
  const user = await createUser('professional');
  const reviewed = verificationStatus !== 'pending';
  await ProfessionalProfile.create({
    userId: user.id,
    verificationStatus,
    verificationDocument: {
      storageKey: `${user.id}.pdf`,
      url: `/private-files/${user.id}.pdf`,
      originalName: 'documento.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 20,
    },
    submittedAt: new Date(),
    reviewedAt: reviewed ? new Date() : null,
    reviewedBy: reviewed ? user.id : null,
    rejectionReason:
      verificationStatus === 'rejected' ? 'Motivo privado.' : null,
  });
  return user;
}

function createNotification(user, overrides = {}) {
  return Notification.create({
    userId: user.id,
    type: NOTIFICATION_TYPES.LINK_REQUESTED,
    title: 'Nova solicitação de vínculo',
    message: 'Você recebeu uma solicitação de vínculo profissional.',
    entityType: NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
    entityId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  await Notification.init();
}, 120000);

afterEach(async () => {
  await Promise.all([
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Notifications API V1', () => {
  it('exige autenticação em todos os endpoints', async () => {
    const id = new mongoose.Types.ObjectId();
    const responses = await Promise.all([
      request(app).get('/api/v1/notifications'),
      request(app).patch(`/api/v1/notifications/${id}/read`).send({}),
      request(app).patch('/api/v1/notifications/read-all').send({}),
      request(app).patch(`/api/v1/notifications/${id}/archive`).send({}),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401,
    ]);
  });

  it.each([
    ['admin', null],
    ['athlete', null],
    ['professional approved', 'approved'],
    ['professional pending', 'pending'],
    ['professional rejected', 'rejected'],
  ])('%s lista somente as próprias notificações', async (label, status) => {
    const role = label.startsWith('professional') ? 'professional' : label;
    const user = status
      ? await createProfessional(status)
      : await createUser(role);
    const other = await createUser();
    await createNotification(user);
    await createNotification(other);

    const response = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', authorization(user));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        type: NOTIFICATION_TYPES.LINK_REQUESTED,
        entityType:
          NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
      }),
    );
    expect(response.body.data[0]).not.toHaveProperty('userId');
    expect(response.body.data[0]).not.toHaveProperty('__v');
    expect(response.body.data[0]).not.toHaveProperty('metadata');
  });

  it('filtra leitura e arquivamento com defaults estritos', async () => {
    const athlete = await createUser();
    await createNotification(athlete);
    await createNotification(athlete, { readAt: new Date() });
    await createNotification(athlete, {
      readAt: new Date(),
      archivedAt: new Date(),
    });

    const unread = await request(app)
      .get('/api/v1/notifications?read=false')
      .set('Authorization', authorization(athlete));
    const read = await request(app)
      .get('/api/v1/notifications?read=true&archived=false')
      .set('Authorization', authorization(athlete));
    const archived = await request(app)
      .get('/api/v1/notifications?archived=true')
      .set('Authorization', authorization(athlete));

    expect(unread.body.data).toHaveLength(1);
    expect(read.body.data).toHaveLength(1);
    expect(archived.body.data).toHaveLength(1);
    expect(archived.body.data[0].archivedAt).not.toBeNull();
  });

  it('pagina e ordena por createdAt desc e _id desc', async () => {
    const athlete = await createUser();
    const instant = new Date('2026-07-29T12:00:00.000Z');
    const first = await createNotification(athlete, { createdAt: instant });
    const second = await createNotification(athlete, { createdAt: instant });
    await createNotification(athlete, {
      createdAt: new Date('2026-07-28T12:00:00.000Z'),
    });

    const response = await request(app)
      .get('/api/v1/notifications?page=1&limit=2')
      .set('Authorization', authorization(athlete));

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(response.body.data.map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('rejeita query desconhecida, filtro de ownership e booleano inválido', async () => {
    const athlete = await createUser();
    const responses = await Promise.all([
      request(app)
        .get(`/api/v1/notifications?userId=${athlete.id}`)
        .set('Authorization', authorization(athlete)),
      request(app)
        .get('/api/v1/notifications?sortBy=createdAt')
        .set('Authorization', authorization(athlete)),
      request(app)
        .get('/api/v1/notifications?read=1')
        .set('Authorization', authorization(athlete)),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      400, 400, 400,
    ]);
  });

  it('marca própria como lida de forma idempotente e preserva readAt', async () => {
    const athlete = await createUser();
    const notification = await createNotification(athlete);

    const first = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', authorization(athlete))
      .send({});
    const second = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', authorization(athlete))
      .send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.readAt).not.toBeNull();
    expect(second.body.data.readAt).toBe(first.body.data.readAt);
  });

  it('permite marcar notificação própria arquivada como lida', async () => {
    const athlete = await createUser();
    const notification = await createNotification(athlete, {
      archivedAt: new Date(),
    });

    const response = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', authorization(athlete))
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.data.readAt).not.toBeNull();
    expect(response.body.data.archivedAt).not.toBeNull();
  });

  it('oculta recurso alheio e valida ObjectId e body de read', async () => {
    const athlete = await createUser();
    const other = await createUser();
    const notification = await createNotification(other);

    const outside = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', authorization(athlete))
      .send({});
    const invalidId = await request(app)
      .patch('/api/v1/notifications/invalid/read')
      .set('Authorization', authorization(athlete))
      .send({});
    const extraBody = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', authorization(other))
      .send({ read: true });

    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('INVALID_OBJECT_ID');
    expect(extraBody.status).toBe(400);
  });

  it('read-all altera somente próprias, não arquivadas e não lidas', async () => {
    const athlete = await createUser();
    const other = await createUser();
    const unreadOne = await createNotification(athlete);
    const unreadTwo = await createNotification(athlete);
    const alreadyReadAt = new Date('2026-07-20T12:00:00.000Z');
    const alreadyRead = await createNotification(athlete, {
      readAt: alreadyReadAt,
    });
    const archived = await createNotification(athlete, {
      archivedAt: new Date(),
    });
    const outside = await createNotification(other);

    const first = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', authorization(athlete))
      .send({});
    const second = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', authorization(athlete))
      .send({});

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      success: true,
      data: { updatedCount: 2 },
      message: 'Notificações marcadas como lidas.',
    });
    expect(second.body.data.updatedCount).toBe(0);

    const [one, two, read, archivedAfter, outsideAfter] = await Promise.all([
      Notification.findById(unreadOne.id),
      Notification.findById(unreadTwo.id),
      Notification.findById(alreadyRead.id),
      Notification.findById(archived.id),
      Notification.findById(outside.id),
    ]);
    expect(one.readAt.getTime()).toBe(two.readAt.getTime());
    expect(read.readAt).toEqual(alreadyReadAt);
    expect(archivedAfter.readAt).toBeNull();
    expect(outsideAfter.readAt).toBeNull();
  });

  it('read-all não conflita com :id e rejeita body extra', async () => {
    const athlete = await createUser();
    const response = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', authorization(athlete))
      .send({ all: true });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('arquiva própria com idempotência, preserva timestamp e readAt', async () => {
    const athlete = await createUser();
    const readAt = new Date('2026-07-20T12:00:00.000Z');
    const notification = await createNotification(athlete, { readAt });

    const first = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({});
    const second = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.archivedAt).not.toBeNull();
    expect(second.body.data.archivedAt).toBe(first.body.data.archivedAt);
    expect(second.body.data.readAt).toBe(readAt.toISOString());
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('oculta recurso alheio e rejeita body extra de archive', async () => {
    const athlete = await createUser();
    const other = await createUser();
    const notification = await createNotification(other);

    const outside = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({});
    const extraBody = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/archive`)
      .set('Authorization', authorization(other))
      .send({ archived: true });

    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(extraBody.status).toBe(400);
  });

  it('não expõe criação, PATCH genérico, restore ou DELETE', async () => {
    const athlete = await createUser();
    const notification = await createNotification(athlete);
    const calls = [
      request(app).post('/api/v1/notifications').send({}),
      request(app).patch(`/api/v1/notifications/${notification.id}`).send({}),
      request(app)
        .patch(`/api/v1/notifications/${notification.id}/restore`)
        .send({}),
      request(app).delete(`/api/v1/notifications/${notification.id}`),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(athlete))),
    );

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
  });
});
