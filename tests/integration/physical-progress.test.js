const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AuditLog = require('../../src/models/audit-log');
const PhysicalProgress = require('../../src/models/physical-progress');
const ProfessionalAthleteLink = require(
  '../../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../../src/models/professional-profile');
const User = require('../../src/models/user');
const auditService = require('../../src/services/audit-service');
const { generateToken } = require('../../src/utils/jwt');

let mongoServer;
let passwordHash;

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

async function createUser(role, verificationStatus = 'approved') {
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash,
    role,
  });
  if (role === 'professional') {
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
      reviewedAt: reviewed ? new Date() : null,
      reviewedBy: reviewed ? user.id : null,
      rejectionReason:
        verificationStatus === 'rejected' ? 'Rejeitado.' : null,
    });
  }
  return user;
}

function createLink(professional, athlete, status = 'active') {
  const now = new Date();
  return ProfessionalAthleteLink.create({
    professionalId: professional.id,
    athleteId: athlete.id,
    status,
    requestedAt: now,
    acceptedAt: ['active', 'ended'].includes(status) ? now : null,
    rejectedAt: status === 'rejected' ? now : null,
    endedAt: status === 'ended' ? now : null,
    endedBy: status === 'ended' ? professional.id : null,
  });
}

function payload(overrides = {}) {
  return {
    referenceDate: '2026-08-01T12:00:00.000Z',
    weightKg: 80.5,
    ...overrides,
  };
}

function createProgress(athlete, recordedBy = athlete, overrides = {}) {
  return PhysicalProgress.create({
    athleteId: athlete.id,
    recordedBy: recordedBy.id,
    referenceDate: new Date('2026-08-01T12:00:00.000Z'),
    weightKg: 80,
    ...overrides,
  });
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('SenhaForte123!', 10);
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all([
    AuditLog.deleteMany({}),
    PhysicalProgress.deleteMany({}),
    ProfessionalAthleteLink.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Physical Progress API V1', () => {
  it('exige autenticação em todos os endpoints', async () => {
    const id = new mongoose.Types.ObjectId();
    const responses = await Promise.all([
      request(app).get('/api/v1/progress'),
      request(app).get(`/api/v1/progress/${id}`),
      request(app).post('/api/v1/progress').send(payload()),
      request(app).patch(`/api/v1/progress/${id}`).send({ weightKg: 81 }),
      request(app).patch(`/api/v1/progress/${id}/archive`).send({}),
    ]);
    expect(responses.map((response) => response.status)).toEqual(
      [401, 401, 401, 401, 401],
    );
  });

  it('atleta cria registro próprio, normalizado e com auditoria segura', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/progress')
      .set('Authorization', authorization(athlete))
      .send(payload({
        weightKg: null,
        measurements: { waistCm: 82.125 },
        notes: '  Registro informado.  ',
      }));

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      athleteId: athlete.id,
      recordedBy: athlete.id,
      weightKg: null,
      measurements: {
        chestCm: null,
        waistCm: 82.125,
        armCm: null,
        thighCm: null,
        calfCm: null,
      },
      notes: 'Registro informado.',
    }));
    expect(response.body.data).not.toHaveProperty('__v');
    expect(response.body.data).not.toHaveProperty('professionalId');

    const log = await AuditLog.findOne({
      action: AUDIT_ACTIONS.PROGRESS_CREATED,
    });
    expect(log.entityType).toBe('PhysicalProgress');
    expect(log.metadata).toEqual(expect.objectContaining({
      athleteId: athlete.id,
      recordedByRole: 'athlete',
      fieldsPresent: ['measurements', 'notes'],
    }));
    expect(Object.keys(log.metadata).sort()).toEqual([
      'athleteId',
      'fieldsPresent',
      'recordedByRole',
    ]);
    expect(log.metadata).not.toHaveProperty('weightKg');
    expect(log.metadata).not.toHaveProperty('bodyFatPercent');
    expect(log.metadata).not.toHaveProperty('measurements');
    expect(log.metadata).not.toHaveProperty('notes');
  });

  it('atleta não informa athleteId e criação vazia é rejeitada', async () => {
    const athlete = await createUser('athlete');
    const otherId = new mongoose.Types.ObjectId().toString();
    const athleteIdResponse = await request(app)
      .post('/api/v1/progress')
      .set('Authorization', authorization(athlete))
      .send(payload({ athleteId: otherId }));
    const emptyResponse = await request(app)
      .post('/api/v1/progress')
      .set('Authorization', authorization(athlete))
      .send({
        referenceDate: '2026-08-01T12:00:00.000Z',
        measurements: {},
        notes: ' ',
      });

    expect(athleteIdResponse.status).toBe(400);
    expect(athleteIdResponse.body.error.code).toBe('VALIDATION_ERROR');
    expect(emptyResponse.status).toBe(400);
    expect(await PhysicalProgress.countDocuments()).toBe(0);
  });

  it('profissional approved com link active cria e recordedBy vem do JWT', async () => {
    const [professional, athlete] = await Promise.all([
      createUser('professional'),
      createUser('athlete'),
    ]);
    await createLink(professional, athlete);
    const response = await request(app)
      .post('/api/v1/progress')
      .set('Authorization', authorization(professional))
      .send(payload({ athleteId: athlete.id, notes: 'Registro.' }));

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual(expect.objectContaining({
      athleteId: athlete.id,
      recordedBy: professional.id,
    }));
  });

  it.each(['pending', 'rejected'])(
    'profissional %s não exerce permissão profissional',
    async (verificationStatus) => {
      const professional = await createUser(
        'professional',
        verificationStatus,
      );
      const athlete = await createUser('athlete');
      const response = await request(app)
        .post('/api/v1/progress')
        .set('Authorization', authorization(professional))
        .send(payload({ athleteId: athlete.id }));
      expect(response.status).toBe(403);
      expect(await PhysicalProgress.countDocuments()).toBe(0);
    },
  );

  it.each(['pending', 'rejected', 'ended'])(
    'vínculo %s não concede criação',
    async (status) => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete, status);
      const response = await request(app)
        .post('/api/v1/progress')
        .set('Authorization', authorization(professional))
        .send(payload({ athleteId: athlete.id }));
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
    },
  );

  it('admin recebe FORBIDDEN em todos os endpoints', async () => {
    const admin = await createUser('admin');
    const id = new mongoose.Types.ObjectId();
    const calls = [
      request(app).get('/api/v1/progress'),
      request(app).get(`/api/v1/progress/${id}`),
      request(app).post('/api/v1/progress').send(payload()),
      request(app).patch(`/api/v1/progress/${id}`).send({ weightKg: 81 }),
      request(app).patch(`/api/v1/progress/${id}/archive`).send({}),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(admin))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [403, 403, 403, 403, 403],
    );
    responses.forEach((response) => {
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  it('listagem respeita ownership, filtros, paginação e ordenação', async () => {
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    await createProgress(athlete, athlete, {
      referenceDate: new Date('2026-08-03'),
      weightKg: 83,
    });
    await createProgress(athlete, athlete, {
      referenceDate: new Date('2026-08-01'),
      weightKg: 81,
      archivedAt: new Date(),
    });
    await createProgress(outsider);

    const active = await request(app)
      .get(
        `/api/v1/progress?athleteId=${outsider.id}` +
        '&dateFrom=2026-08-02&dateTo=2026-08-04&page=1&limit=1' +
        '&sortBy=referenceDate&sortOrder=desc',
      )
      .set('Authorization', authorization(athlete));
    expect(active.status).toBe(200);
    expect(active.body.data).toHaveLength(0);

    const own = await request(app)
      .get('/api/v1/progress?dateFrom=2026-08-02&limit=1')
      .set('Authorization', authorization(athlete));
    expect(own.body.data).toHaveLength(1);
    expect(own.body.meta).toMatchObject({ page: 1, limit: 1, total: 1 });

    const archived = await request(app)
      .get('/api/v1/progress?archived=true')
      .set('Authorization', authorization(athlete));
    expect(archived.body.data).toHaveLength(1);
    expect(archived.body.data[0].weightKg).toBe(81);
  });

  it('rejeita query desconhecida, sort arbitrário e intervalo invertido', async () => {
    const athlete = await createUser('athlete');
    for (const query of [
      'unknown=true',
      'sortBy=weightKg',
      'archived=all',
      'dateFrom=2026-08-02&dateTo=2026-08-01',
    ]) {
      const response = await request(app)
        .get(`/api/v1/progress?${query}`)
        .set('Authorization', authorization(athlete));
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('profissional lê registros no vínculo independentemente da autoria', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    await createLink(professional, athlete);
    const own = await createProgress(athlete);
    await createProgress(outsider);

    const list = await request(app)
      .get('/api/v1/progress')
      .set('Authorization', authorization(professional));
    const detail = await request(app)
      .get(`/api/v1/progress/${own.id}`)
      .set('Authorization', authorization(professional));

    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(detail.status).toBe(200);
  });

  it('fora do ownership ou vínculo retorna 404 seguro e ObjectId inválido é 400', async () => {
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    const progress = await createProgress(outsider);

    const hidden = await request(app)
      .get(`/api/v1/progress/${progress.id}`)
      .set('Authorization', authorization(athlete));
    const invalid = await request(app)
      .get('/api/v1/progress/id-invalido')
      .set('Authorization', authorization(athlete));

    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_OBJECT_ID');
  });

  it('encerrar vínculo remove imediatamente leitura e mutação profissional', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const link = await createLink(professional, athlete);
    const progress = await createProgress(athlete, professional);
    link.status = 'ended';
    link.endedAt = new Date();
    link.endedBy = professional.id;
    await link.save();

    const calls = [
      request(app).get(`/api/v1/progress/${progress.id}`),
      request(app).patch(`/api/v1/progress/${progress.id}`).send({
        weightKg: 81,
      }),
      request(app).patch(`/api/v1/progress/${progress.id}/archive`).send({}),
    ];
    const responses = await Promise.all(
      calls.map((call) =>
        call.set('Authorization', authorization(professional))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [404, 404, 404],
    );
  });

  it('atleta atualiza registro próprio com merge e pode remover uma medida', async () => {
    const athlete = await createUser('athlete');
    const professional = await createUser('professional');
    const progress = await createProgress(athlete, professional, {
      weightKg: null,
      measurements: { chestCm: 100, waistCm: 80, armCm: 35 },
    });
    const response = await request(app)
      .patch(`/api/v1/progress/${progress.id}`)
      .set('Authorization', authorization(athlete))
      .send({ measurements: { waistCm: 79, armCm: null } });

    expect(response.status).toBe(200);
    expect(response.body.data.measurements).toEqual({
      chestCm: 100,
      waistCm: 79,
      armCm: null,
      thighCm: null,
      calfCm: null,
    });
    expect(
      await AuditLog.countDocuments({
        action: { $nin: [
          AUDIT_ACTIONS.PROGRESS_CREATED,
          AUDIT_ACTIONS.PROGRESS_ARCHIVED,
        ] },
      }),
    ).toBe(0);
  });

  it('profissional só atualiza e arquiva registro de sua autoria', async () => {
    const professional = await createUser('professional');
    const otherProfessional = await createUser('professional');
    const athlete = await createUser('athlete');
    await Promise.all([
      createLink(professional, athlete),
      createLink(otherProfessional, athlete),
    ]);
    const own = await createProgress(athlete, professional);
    const athleteAuthored = await createProgress(athlete);
    const otherAuthored = await createProgress(athlete, otherProfessional);

    const updateOwn = await request(app)
      .patch(`/api/v1/progress/${own.id}`)
      .set('Authorization', authorization(professional))
      .send({ weightKg: 81 });
    const updateAthlete = await request(app)
      .patch(`/api/v1/progress/${athleteAuthored.id}`)
      .set('Authorization', authorization(professional))
      .send({ weightKg: 81 });
    const archiveOther = await request(app)
      .patch(`/api/v1/progress/${otherAuthored.id}/archive`)
      .set('Authorization', authorization(professional))
      .send({});
    const archiveOwn = await request(app)
      .patch(`/api/v1/progress/${own.id}/archive`)
      .set('Authorization', authorization(professional))
      .send({});

    expect(updateOwn.status).toBe(200);
    expect(updateAthlete.status).toBe(404);
    expect(archiveOther.status).toBe(404);
    expect(archiveOwn.status).toBe(200);
  });

  it('PATCH rejeita content-type, body/campos inválidos e estado final vazio', async () => {
    const athlete = await createUser('athlete');
    const progress = await createProgress(athlete);
    const noJson = await request(app)
      .patch(`/api/v1/progress/${progress.id}`)
      .set('Authorization', authorization(athlete))
      .type('form')
      .send({ weightKg: 81 });
    expect(noJson.status).toBe(400);

    for (const body of [
      {},
      { athleteId: athlete.id },
      { recordedBy: athlete.id },
      { professionalId: athlete.id },
      { weightKg: '81' },
      { measurements: {} },
    ]) {
      const invalid = await request(app)
        .patch(`/api/v1/progress/${progress.id}`)
        .set('Authorization', authorization(athlete))
        .send(body);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    }

    const empty = await request(app)
      .patch(`/api/v1/progress/${progress.id}`)
      .set('Authorization', authorization(athlete))
      .send({ weightKg: null });
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('registro arquivado não atualiza e archive é idempotente e winner-only', async () => {
    const athlete = await createUser('athlete');
    const progress = await createProgress(athlete);
    const call = () =>
      request(app)
        .patch(`/api/v1/progress/${progress.id}/archive`)
        .set('Authorization', authorization(athlete))
        .send({});
    const [first, second] = await Promise.all([call(), call()]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.archivedAt).toBe(second.body.data.archivedAt);
    expect(
      await AuditLog.countDocuments({
        action: AUDIT_ACTIONS.PROGRESS_ARCHIVED,
        entityId: progress._id,
      }),
    ).toBe(1);

    const update = await request(app)
      .patch(`/api/v1/progress/${progress.id}`)
      .set('Authorization', authorization(athlete))
      .send({ notes: 'Novo.' });
    const extra = await request(app)
      .patch(`/api/v1/progress/${progress.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({ reason: 'não permitido' });
    expect(update.status).toBe(422);
    expect(update.body.error.code).toBe('INVALID_STATE_TRANSITION');
    expect(extra.status).toBe(400);
  });

  it('falha de auditoria na criação compensa o registro persistido', async () => {
    const athlete = await createUser('athlete');
    jest.spyOn(auditService, 'record').mockRejectedValueOnce(
      new Error('auditoria'),
    );
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .post('/api/v1/progress')
      .set('Authorization', authorization(athlete))
      .send(payload());
    expect(response.status).toBe(500);
    expect(await PhysicalProgress.countDocuments()).toBe(0);
  });

  it('não expõe DELETE, restore ou aliases fora do contrato', async () => {
    const athlete = await createUser('athlete');
    const progress = await createProgress(athlete);
    const calls = [
      request(app).delete(`/api/v1/progress/${progress.id}`),
      request(app).patch(`/api/v1/progress/${progress.id}/restore`).send({}),
      request(app).get('/api/v1/evolution'),
      request(app).get('/api/v1/physical-progress'),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(athlete))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [404, 404, 404, 404],
    );
  });
});
