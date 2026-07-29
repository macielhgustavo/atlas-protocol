const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AuditLog = require('../../src/models/audit-log');
const CheckIn = require('../../src/models/check-in');
const Exam = require('../../src/models/exam');
const PhysicalProgress = require('../../src/models/physical-progress');
const ProfessionalAthleteLink = require(
  '../../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../../src/models/professional-profile');
const Protocol = require('../../src/models/protocol');
const ProtocolVersion = require('../../src/models/protocol-version');
const TrackingRecord = require('../../src/models/tracking-record');
const User = require('../../src/models/user');
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

function initialStatus(professional, changedAt = new Date('2026-01-01')) {
  return {
    from: null,
    to: 'draft',
    reason: null,
    changedAt,
    changedBy: professional.id,
  };
}

async function createProtocol(
  athlete,
  professional,
  overrides = {},
) {
  const statusHistory = overrides.statusHistory || [
    initialStatus(professional),
  ];
  return Protocol.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    title: 'Protocolo de acompanhamento',
    status: statusHistory.at(-1).to,
    currentVersion: 1,
    startDate: new Date('2026-01-01'),
    statusHistory,
    ...overrides,
  });
}

function createVersion(protocol, professional, overrides = {}) {
  return ProtocolVersion.create({
    protocolId: protocol.id,
    version: 1,
    createdBy: professional.id,
    startDate: new Date('2026-01-01'),
    continuous: true,
    items: [],
    ...overrides,
  });
}

function createTracking(athlete, overrides = {}) {
  const status = overrides.status || 'completed';
  return TrackingRecord.create({
    athleteId: athlete.id,
    professionalId: null,
    protocolId: null,
    protocolVersion: null,
    type: 'manual',
    title: 'Registro de acompanhamento',
    scheduledFor: new Date('2026-01-01'),
    status,
    statusReason: ['missed', 'cancelled'].includes(status)
      ? 'Motivo registrado.'
      : null,
    completedAt:
      status === 'completed' ? new Date('2026-01-04T12:00:00.000Z') : null,
    completedBy: status === 'completed' ? athlete.id : null,
    notes: 'Observação sensível.',
    createdBy: athlete.id,
    ...overrides,
  });
}

function createCheckIn(athlete, professional, overrides = {}) {
  const status = overrides.status || 'submitted';
  return CheckIn.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    referenceWeek: new Date('2026-01-05T03:00:00.000Z'),
    status,
    responses: { private: 'Resposta sensível.' },
    submittedAt:
      status === 'pending' ? null : new Date('2026-01-05T12:00:00.000Z'),
    reviewedAt:
      status === 'reviewed' ? new Date('2026-01-06T12:00:00.000Z') : null,
    reviewedBy: status === 'reviewed' ? professional.id : null,
    reviewComment: status === 'reviewed' ? 'Comentário sensível.' : null,
    ...overrides,
  });
}

function createExam(athlete, overrides = {}) {
  return Exam.create({
    athleteId: athlete.id,
    professionalId: null,
    title: 'Exame informado',
    examDate: new Date('2026-01-07T12:00:00.000Z'),
    laboratory: 'Laboratório privado',
    results: [{ marker: 'Privado', value: '10' }],
    notes: 'Observação privada.',
    createdBy: athlete.id,
    ...overrides,
  });
}

function createProgress(athlete, overrides = {}) {
  return PhysicalProgress.create({
    athleteId: athlete.id,
    recordedBy: athlete.id,
    referenceDate: new Date('2026-01-08T12:00:00.000Z'),
    weightKg: 80,
    measurements: { waistCm: 80 },
    notes: 'Observação privada.',
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
    CheckIn.deleteMany({}),
    Exam.deleteMany({}),
    PhysicalProgress.deleteMany({}),
    ProfessionalAthleteLink.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    ProtocolVersion.deleteMany({}),
    Protocol.deleteMany({}),
    TrackingRecord.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('History Timeline API V1', () => {
  it('exige autenticação e rejeita token inválido ou usuário inexistente', async () => {
    const noToken = await request(app).get('/api/v1/history');
    const invalidToken = await request(app)
      .get('/api/v1/history')
      .set('Authorization', 'Bearer inválido');
    const missingUser = {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'athlete',
    };
    const missing = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(missingUser));

    expect(noToken.status).toBe(401);
    expect(invalidToken.status).toBe(401);
    expect(missing.status).toBe(401);
  });

  it.each([
    { active: false, blockedAt: null },
    { active: true, blockedAt: new Date() },
  ])('bloqueia usuário inativo ou bloqueado %#', async (state) => {
    const athlete = await createUser('athlete');
    await User.updateOne({ _id: athlete.id }, { $set: state });
    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('USER_BLOCKED');
  });

  it('admin e role persistida inválida recebem FORBIDDEN', async () => {
    const admin = await createUser('admin');
    const invalidRole = await createUser('athlete');
    await User.collection.updateOne(
      { _id: invalidRole._id },
      { $set: { role: 'invalid-role' } },
    );

    const adminResponse = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(admin));
    const invalidRoleResponse = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(invalidRole));
    expect(adminResponse.status).toBe(403);
    expect(invalidRoleResponse.status).toBe(403);
    expect(adminResponse.body.error.code).toBe('FORBIDDEN');
  });

  it('atleta vê somente eventos próprios e não pode enviar athleteId', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    const ownExam = await createExam(athlete);
    await createExam(outsider);

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    const forbiddenFilter = await request(app)
      .get(`/api/v1/history?athleteId=${athlete.id}`)
      .set('Authorization', authorization(athlete));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].entityId).toBe(ownExam.id);
    expect(forbiddenFilter.status).toBe(400);
    expect(forbiddenFilter.body.error.code).toBe('VALIDATION_ERROR');
    expect(professional).toBeDefined();
  });

  it('profissional exige athleteId, aprovação e vínculo active', async () => {
    const athlete = await createUser('athlete');
    const approved = await createUser('professional');
    const missingAthlete = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(approved));
    expect(missingAthlete.status).toBe(400);

    for (const verificationStatus of ['pending', 'rejected']) {
      const professional = await createUser(
        'professional',
        verificationStatus,
      );
      const response = await request(app)
        .get(`/api/v1/history?athleteId=${athlete.id}`)
        .set('Authorization', authorization(professional));
      expect(response.status).toBe(403);
    }
  });

  it.each(['pending', 'rejected', 'ended'])(
    'vínculo %s não concede acesso e usa 404 seguro',
    async (status) => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete, status);
      const response = await request(app)
        .get(`/api/v1/history?athleteId=${athlete.id}`)
        .set('Authorization', authorization(professional));
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
    },
  );

  it('atleta inexistente ou não vinculado retorna 404', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const missingId = new mongoose.Types.ObjectId();

    for (const athleteId of [athlete.id, missingId]) {
      const response = await request(app)
        .get(`/api/v1/history?athleteId=${athleteId}`)
        .set('Authorization', authorization(professional));
      expect(response.status).toBe(404);
    }
  });

  it('ObjectId inválido retorna INVALID_OBJECT_ID', async () => {
    const professional = await createUser('professional');
    const response = await request(app)
      .get('/api/v1/history?athleteId=id-invalido')
      .set('Authorization', authorization(professional));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_OBJECT_ID');
  });

  it('encerramento de vínculo remove acesso imediatamente', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const link = await createLink(professional, athlete);
    await createExam(athlete);
    const url = `/api/v1/history?athleteId=${athlete.id}`;

    const before = await request(app)
      .get(url)
      .set('Authorization', authorization(professional));
    link.status = 'ended';
    link.endedAt = new Date();
    link.endedBy = professional.id;
    await link.save();
    const after = await request(app)
      .get(url)
      .set('Authorization', authorization(professional));

    expect(before.status).toBe(200);
    expect(after.status).toBe(404);
  });

  it('gera versões e status de protocolo com IDs estáveis', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const history = [
      initialStatus(professional, new Date('2026-01-01')),
      {
        from: 'draft',
        to: 'active',
        reason: 'Motivo que não pode aparecer.',
        changedAt: new Date('2026-01-02'),
        changedBy: professional.id,
      },
      {
        from: 'active',
        to: 'paused',
        reason: 'Outro motivo privado.',
        changedAt: new Date('2026-01-03'),
        changedBy: professional.id,
      },
      {
        from: 'paused',
        to: 'active',
        reason: null,
        changedAt: new Date('2026-01-04'),
        changedBy: professional.id,
      },
      {
        from: 'active',
        to: 'closed',
        reason: null,
        changedAt: new Date('2026-01-05'),
        changedBy: professional.id,
      },
    ];
    const protocol = await createProtocol(athlete, professional, {
      currentVersion: 2,
      statusHistory: history,
    });
    const cancelledProtocol = await createProtocol(athlete, professional, {
      title: 'Protocolo cancelado',
      statusHistory: [
        initialStatus(professional, new Date('2026-01-01')),
        {
          from: 'draft',
          to: 'cancelled',
          reason: 'Motivo privado.',
          changedAt: new Date('2026-01-02'),
          changedBy: professional.id,
        },
      ],
    });
    const [version1, version2] = await Promise.all([
      createVersion(protocol, professional),
      createVersion(protocol, professional, {
        version: 2,
        changeReason: 'Texto privado.',
      }),
    ]);

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    const versionEvents = response.body.data.filter(
      (event) => event.type === 'protocol_version',
    );
    const statusEvents = response.body.data.filter(
      (event) => event.type === 'protocol_status',
    );

    expect(versionEvents).toHaveLength(2);
    expect(versionEvents.map((event) => event.id)).toEqual(
      expect.arrayContaining([
        `protocol_version:${version1.id}`,
        `protocol_version:${version2.id}`,
      ]),
    );
    expect(versionEvents.every((event) => event.entityId === protocol.id))
      .toBe(true);
    expect(statusEvents).toHaveLength(5);
    expect(statusEvents.map((event) => event.id)).toEqual(
      expect.arrayContaining([
        `protocol_status:${protocol.id}:1`,
        `protocol_status:${protocol.id}:2`,
        `protocol_status:${protocol.id}:3`,
        `protocol_status:${protocol.id}:4`,
        `protocol_status:${cancelledProtocol.id}:1`,
      ]),
    );
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /Motivo que|Outro motivo|Texto privado|instructions|items/i,
    );
  });

  it('tracking inclui somente estados finais e usa a semântica temporal', async () => {
    const athlete = await createUser('athlete');
    const completed = await createTracking(athlete);
    const missed = await createTracking(athlete, { status: 'missed' });
    const cancelled = await createTracking(athlete, { status: 'cancelled' });
    await createTracking(athlete, {
      status: 'scheduled',
      statusReason: null,
      completedAt: null,
      completedBy: null,
    });

    const response = await request(app)
      .get('/api/v1/history?type=tracking')
      .set('Authorization', authorization(athlete));
    expect(response.body.data).toHaveLength(3);
    expect(response.body.data.map((event) => event.id)).toEqual(
      expect.arrayContaining([
        `tracking:${completed.id}`,
        `tracking:${missed.id}`,
        `tracking:${cancelled.id}`,
      ]),
    );
    expect(
      response.body.data.find((event) => event.id === `tracking:${completed.id}`)
        .occurredAt,
    ).toBe('2026-01-04T12:00:00.000Z');
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /Observação sensível|notes|statusReason/i,
    );
  });

  it('check-in pending não aparece e reviewed gera envio e revisão', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    await createCheckIn(athlete, professional, { status: 'pending' });
    const reviewed = await createCheckIn(athlete, professional, {
      referenceWeek: new Date('2026-01-12T03:00:00.000Z'),
      status: 'reviewed',
    });

    const response = await request(app)
      .get('/api/v1/history?type=checkin')
      .set('Authorization', authorization(athlete));
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((event) => event.id)).toEqual(
      expect.arrayContaining([
        `checkin:${reviewed.id}:submitted`,
        `checkin:${reviewed.id}:reviewed`,
      ]),
    );
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /Resposta sensível|Comentário sensível|responses|reviewComment/i,
    );
  });

  it('exames e evoluções ativos e arquivados continuam presentes', async () => {
    const athlete = await createUser('athlete');
    const activeExam = await createExam(athlete);
    const archivedExam = await createExam(athlete, {
      archivedAt: new Date(),
      examDate: new Date('2026-01-09'),
    });
    const activeProgress = await createProgress(athlete);
    const archivedProgress = await createProgress(athlete, {
      archivedAt: new Date(),
      referenceDate: new Date('2026-01-10'),
    });

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    expect(response.body.data.map((event) => event.id)).toEqual(
      expect.arrayContaining([
        `exam:${activeExam.id}`,
        `exam:${archivedExam.id}`,
        `progress:${activeProgress.id}`,
        `progress:${archivedProgress.id}`,
      ]),
    );
  });

  it('resposta possui campos exatos e não vaza conteúdo sensível', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    await Promise.all([
      createTracking(athlete),
      createCheckIn(athlete, professional, { status: 'reviewed' }),
      createExam(athlete),
      createProgress(athlete),
    ]);

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    for (const event of response.body.data) {
      expect(Object.keys(event)).toEqual([
        'id',
        'type',
        'occurredAt',
        'title',
        'summary',
        'entityId',
      ]);
      expect(event.title.length).toBeLessThanOrEqual(160);
      expect(event.summary.length).toBeLessThanOrEqual(300);
    }
    expect(JSON.stringify(response.body)).not.toMatch(
      /notes|responses|reviewComment|results|weightKg|bodyFatPercent|measurements|document|storageKey|laboratory|professionalId|recordedBy|createdBy|completedBy|reviewedBy|metadata|password|token/i,
    );
  });

  it('aplica type, datas e rejeita queries fora do contrato', async () => {
    const athlete = await createUser('athlete');
    await Promise.all([
      createExam(athlete, { examDate: new Date('2026-01-01') }),
      createExam(athlete, { examDate: new Date('2026-01-10') }),
      createProgress(athlete),
    ]);

    const filtered = await request(app)
      .get(
        '/api/v1/history?type=exam' +
        '&dateFrom=2026-01-05T00:00:00.000Z' +
        '&dateTo=2026-01-15T00:00:00.000Z',
      )
      .set('Authorization', authorization(athlete));
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].type).toBe('exam');

    for (const query of [
      'type=invalid',
      'sortBy=occurredAt',
      'archived=true',
      'dateFrom=2026-01-02&dateTo=2026-01-01',
      'limit=101',
    ]) {
      const invalid = await request(app)
        .get(`/api/v1/history?${query}`)
        .set('Authorization', authorization(athlete));
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('pagina globalmente múltiplas fontes e totaliza eventos reais', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const protocol = await createProtocol(athlete, professional);
    await Promise.all([
      createVersion(protocol, professional, {
        createdAt: new Date('2026-01-02'),
      }),
      createTracking(athlete, {
        completedAt: new Date('2026-01-04'),
      }),
      createCheckIn(athlete, professional, {
        submittedAt: new Date('2026-01-03'),
      }),
      createExam(athlete, { examDate: new Date('2026-01-06') }),
      createProgress(athlete, { referenceDate: new Date('2026-01-05') }),
    ]);

    const page1 = await request(app)
      .get('/api/v1/history?page=1&limit=2')
      .set('Authorization', authorization(athlete));
    const page2 = await request(app)
      .get('/api/v1/history?page=2&limit=2')
      .set('Authorization', authorization(athlete));
    const emptyPage = await request(app)
      .get('/api/v1/history?page=4&limit=2')
      .set('Authorization', authorization(athlete));

    expect(page1.body.data.map((event) => event.type)).toEqual([
      'exam',
      'progress',
    ]);
    expect(page2.body.data.map((event) => event.type)).toEqual([
      'tracking',
      'checkin',
    ]);
    expect(page1.body.meta).toEqual({
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(emptyPage.body.data).toEqual([]);
  });

  it('desempata por id desc e mantém IDs estáveis entre chamadas', async () => {
    const athlete = await createUser('athlete');
    const date = new Date('2026-01-01');
    const first = await createExam(athlete, { examDate: date });
    const second = await createExam(athlete, { examDate: date });
    const call = () =>
      request(app)
        .get('/api/v1/history?type=exam')
        .set('Authorization', authorization(athlete));

    const [one, two] = await Promise.all([call(), call()]);
    const expected = [`exam:${first.id}`, `exam:${second.id}`].sort().reverse();
    expect(one.body.data.map((event) => event.id)).toEqual(expected);
    expect(two.body.data.map((event) => event.id)).toEqual(expected);
  });

  it('type consulta somente a fonte relacionada', async () => {
    const athlete = await createUser('athlete');
    await createExam(athlete);
    const spies = [
      jest.spyOn(ProtocolVersion, 'aggregate'),
      jest.spyOn(Protocol, 'aggregate'),
      jest.spyOn(TrackingRecord, 'aggregate'),
      jest.spyOn(CheckIn, 'aggregate'),
      jest.spyOn(PhysicalProgress, 'aggregate'),
    ];
    const examAggregate = jest.spyOn(Exam, 'aggregate');

    const response = await request(app)
      .get('/api/v1/history?type=exam')
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(200);
    expect(examAggregate).toHaveBeenCalledTimes(1);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('não altera fontes nem cria AuditLog', async () => {
    const athlete = await createUser('athlete');
    const exam = await createExam(athlete);
    const before = await Exam.findById(exam.id).lean();

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    const after = await Exam.findById(exam.id).lean();

    expect(response.status).toBe(200);
    expect(after).toEqual(before);
    expect(await AuditLog.countDocuments()).toBe(0);
  });

  it('falha de qualquer fonte retorna INTERNAL_ERROR sem resposta parcial', async () => {
    const athlete = await createUser('athlete');
    await createExam(athlete);
    jest.spyOn(Exam, 'aggregate').mockRejectedValueOnce(
      new Error('falha da fonte'),
    );
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toHaveProperty('data');
  });

  it('não possui model, collection ou métodos de escrita', async () => {
    const athlete = await createUser('athlete');
    const calls = [
      request(app).post('/api/v1/history').send({}),
      request(app).patch('/api/v1/history').send({}),
      request(app).delete('/api/v1/history'),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(athlete))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [404, 404, 404],
    );
    expect(mongoose.modelNames()).not.toEqual(
      expect.arrayContaining(['History', 'Timeline']),
    );
    expect(
      await mongoose.connection.db
        .listCollections({ name: 'history' })
        .hasNext(),
    ).toBe(false);
    expect(
      await mongoose.connection.db
        .listCollections({ name: 'timeline' })
        .hasNext(),
    ).toBe(false);
  });

  it('resposta vazia usa meta zerada', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .get('/api/v1/history')
      .set('Authorization', authorization(athlete));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [],
      meta: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    });
  });
});
