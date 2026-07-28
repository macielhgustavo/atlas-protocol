const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../../src/constants/audit-entity-types');
const ERROR_CODES = require('../../src/constants/error-codes');
const AuditLog = require('../../src/models/audit-log');
const CheckIn = require('../../src/models/check-in');
const ProfessionalAthleteLink = require('../../src/models/professional-athlete-link');
const ProfessionalProfile = require('../../src/models/professional-profile');
const Protocol = require('../../src/models/protocol');
const User = require('../../src/models/user');
const { generateToken } = require('../../src/utils/jwt');

let passwordHash;

async function createUser(role, overrides = {}) {
  const {
    verificationStatus = 'approved',
    withProfessionalProfile = true,
    ...userOverrides
  } = overrides;
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash,
    role,
    ...userOverrides,
  });

  if (role === 'professional' && withProfessionalProfile) {
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
        verificationStatus === 'rejected' ? 'Documento rejeitado.' : null,
    });
  }

  return user;
}

async function createLink(
  professional,
  athlete,
  status = 'active',
  overrides = {},
) {
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
    ...overrides,
  });
}

function statusHistory(professionalId, status) {
  const initial = {
    from: null,
    to: 'draft',
    reason: null,
    changedAt: new Date('2026-07-01T10:00:00.000Z'),
    changedBy: professionalId,
  };
  const activated = {
    from: 'draft',
    to: 'active',
    reason: null,
    changedAt: new Date('2026-07-01T11:00:00.000Z'),
    changedBy: professionalId,
  };

  if (status === 'draft') return [initial];
  if (status === 'cancelled') {
    return [
      initial,
      {
        from: 'draft',
        to: 'cancelled',
        reason: null,
        changedAt: new Date('2026-07-01T11:00:00.000Z'),
        changedBy: professionalId,
      },
    ];
  }
  if (status === 'active') return [initial, activated];
  return [
    initial,
    activated,
    {
      from: 'active',
      to: status,
      reason: null,
      changedAt: new Date('2026-07-01T12:00:00.000Z'),
      changedBy: professionalId,
    },
  ];
}

async function createProtocol(
  professional,
  athlete,
  status = 'active',
  overrides = {},
) {
  return Protocol.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    title: `Protocolo ${new mongoose.Types.ObjectId()}`,
    status,
    currentVersion: 1,
    startDate: new Date('2026-07-01T00:00:00.000Z'),
    endDate: null,
    continuous: true,
    activatedAt:
      ['active', 'paused', 'closed'].includes(status) ?
        new Date('2026-07-01T11:00:00.000Z') :
        null,
    pausedAt:
      status === 'paused' ? new Date('2026-07-01T12:00:00.000Z') : null,
    closedAt:
      status === 'closed' ? new Date('2026-07-01T12:00:00.000Z') : null,
    cancelledAt:
      status === 'cancelled' ?
        new Date('2026-07-01T11:00:00.000Z') :
        null,
    statusHistory: statusHistory(professional.id, status),
    ...overrides,
  });
}

async function createCheckIn(professional, athlete, overrides = {}) {
  const status = overrides.status || 'pending';
  return CheckIn.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    protocolId: null,
    referenceWeek: new Date('2026-08-03T03:00:00.000Z'),
    status,
    responses: {
      notes: 'Registro semanal sem interpretação clínica.',
      energy: 8,
    },
    submittedAt:
      status === 'pending' ? null : new Date('2026-08-09T18:00:00.000Z'),
    reviewedAt:
      status === 'reviewed' ? new Date('2026-08-10T12:00:00.000Z') : null,
    reviewedBy: status === 'reviewed' ? professional.id : null,
    reviewComment:
      status === 'reviewed' ? 'Comentário profissional.' : null,
    ...overrides,
  });
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

function checkInPayload(overrides = {}) {
  return {
    referenceWeek: '2026-08-09T23:30:00-03:00',
    responses: {
      notes: 'Registro semanal.',
      score: 8,
      tags: ['relato', true, null],
    },
    ...overrides,
  };
}

function expectSafeCheckIn(checkIn) {
  expect(checkIn).not.toHaveProperty('answers');
  expect(checkIn).not.toHaveProperty('reopenedAt');
  expect(checkIn).not.toHaveProperty('reopenedBy');
  expect(checkIn).not.toHaveProperty('passwordHash');
}

describe('Check-ins V1', () => {
  let mongoServer;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('SenhaForte123!', 4);
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Promise.all([
      AuditLog.init(),
      CheckIn.init(),
      ProfessionalAthleteLink.init(),
      ProfessionalProfile.init(),
      Protocol.init(),
      User.init(),
    ]);
  }, 120000);

  afterEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      CheckIn.deleteMany({}),
      ProfessionalAthleteLink.deleteMany({}),
      ProfessionalProfile.deleteMany({}),
      Protocol.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it.each([
    ['POST', 'post', '/api/v1/check-ins', checkInPayload()],
    ['GET collection', 'get', '/api/v1/check-ins', undefined],
    [
      'GET item',
      'get',
      `/api/v1/check-ins/${new mongoose.Types.ObjectId()}`,
      undefined,
    ],
    [
      'PATCH item',
      'patch',
      `/api/v1/check-ins/${new mongoose.Types.ObjectId()}`,
      { responses: { notes: 'Atualizado.' } },
    ],
    [
      'PATCH submit',
      'patch',
      `/api/v1/check-ins/${new mongoose.Types.ObjectId()}/submit`,
      {},
    ],
    [
      'PATCH review',
      'patch',
      `/api/v1/check-ins/${new mongoose.Types.ObjectId()}/review`,
      { reviewComment: 'Revisado.' },
    ],
  ])('exige autenticação em %s', async (_label, method, endpoint, body) => {
    let call = request(app)[method](endpoint);
    if (body !== undefined) call = call.send(body);

    const response = await call;

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTH_REQUIRED);
  });

  describe('POST /api/v1/check-ins', () => {
    it('cria pending próprio, deriva vínculo único e normaliza a semana', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);

      const response = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(checkInPayload());

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        athleteId: athlete.id,
        professionalId: professional.id,
        protocolId: null,
        referenceWeek: '2026-08-03T03:00:00.000Z',
        status: 'pending',
        responses: checkInPayload().responses,
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        reviewComment: null,
      });
      expectSafeCheckIn(response.body.data);
      expect(await AuditLog.countDocuments()).toBe(0);
    });

    it('normaliza ISO date-only como data civil de São Paulo', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);

      const response = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(checkInPayload({ referenceWeek: '2026-08-03' }));

      expect(response.status).toBe(201);
      expect(response.body.data.referenceWeek).toBe(
        '2026-08-03T03:00:00.000Z',
      );
    });

    it('deriva o profissional do protocolo active mesmo com múltiplos vínculos', async () => {
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      await createLink(otherProfessional, athlete);
      const protocol = await createProtocol(professional, athlete);

      const response = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(
          checkInPayload({
            protocolId: protocol.id,
            professionalId: professional.id,
          }),
        );

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        athleteId: athlete.id,
        professionalId: professional.id,
        protocolId: protocol.id,
      });
    });

    it('exige seleção explícita entre múltiplos vínculos ativos', async () => {
      const professional = await createUser('professional');
      const selectedProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      await createLink(selectedProfessional, athlete);

      const ambiguous = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(checkInPayload());
      const selected = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(
          checkInPayload({
            professionalId: selectedProfessional.id,
            referenceWeek: '2026-08-10T12:00:00-03:00',
          }),
        );

      expect(ambiguous.status).toBe(400);
      expect(ambiguous.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(ambiguous.body.error.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'professionalId' }),
        ]),
      );
      expect(selected.status).toBe(201);
      expect(selected.body.data.professionalId).toBe(selectedProfessional.id);
    });

    it('rejeita ausência, encerramento ou seleção inválida de vínculo', async () => {
      const professional = await createUser('professional');
      const athleteWithoutLink = await createUser('athlete');
      const athleteWithEndedLink = await createUser('athlete');
      const athleteWithWrongSelection = await createUser('athlete');
      const outsiderProfessional = await createUser('professional');
      await createLink(professional, athleteWithEndedLink, 'ended');
      await createLink(professional, athleteWithWrongSelection);

      const cases = [
        [athleteWithoutLink, checkInPayload()],
        [athleteWithEndedLink, checkInPayload()],
        [
          athleteWithWrongSelection,
          checkInPayload({ professionalId: outsiderProfessional.id }),
        ],
      ];

      for (const [athlete, payload] of cases) {
        const response = await request(app)
          .post('/api/v1/check-ins')
          .set('Authorization', authorization(athlete))
          .send(payload);

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(
          ERROR_CODES.ATHLETE_LINK_REQUIRED,
        );
      }
      expect(await CheckIn.countDocuments()).toBe(0);
    });

    it('valida role professional sem acrescentar disponibilidade da conta à seleção', async () => {
      const wrongRole = await createUser('admin');
      const blockedProfessional = await createUser('professional', {
        active: false,
        blockedAt: new Date(),
      });
      const athleteWithWrongRoleLink = await createUser('athlete');
      const athleteWithBlockedProfessional = await createUser('athlete');
      await createLink(wrongRole, athleteWithWrongRoleLink);
      await createLink(blockedProfessional, athleteWithBlockedProfessional);

      const wrongRoleResponse = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athleteWithWrongRoleLink))
        .send(checkInPayload());
      const blockedResponse = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athleteWithBlockedProfessional))
        .send(checkInPayload());

      expect(wrongRoleResponse.status).toBe(403);
      expect(wrongRoleResponse.body.error.code).toBe(
        ERROR_CODES.ATHLETE_LINK_REQUIRED,
      );
      expect(blockedResponse.status).toBe(201);
      expect(blockedResponse.body.data.professionalId).toBe(
        blockedProfessional.id,
      );
    });

    it.each(['draft', 'paused', 'closed', 'cancelled'])(
      'rejeita protocolo %s ao criar novo check-in',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        await createLink(professional, athlete);
        const protocol = await createProtocol(professional, athlete, status);

        const response = await request(app)
          .post('/api/v1/check-ins')
          .set('Authorization', authorization(athlete))
          .send(checkInPayload({ protocolId: protocol.id }));

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(
          ERROR_CODES.INVALID_STATE_TRANSITION,
        );
      },
    );

    it('exige vínculo active mesmo quando o protocolo está active', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const protocol = await createProtocol(professional, athlete);

      const response = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(checkInPayload({ protocolId: protocol.id }));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        ERROR_CODES.ATHLETE_LINK_REQUIRED,
      );
      expect(await CheckIn.countDocuments()).toBe(0);
    });

    it('oculta protocolo de outro atleta e rejeita profissional conflitante', async () => {
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      const otherAthlete = await createUser('athlete');
      await createLink(professional, athlete);
      const otherProtocol = await createProtocol(professional, otherAthlete);
      const ownProtocol = await createProtocol(professional, athlete);

      const hidden = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(checkInPayload({ protocolId: otherProtocol.id }));
      const conflict = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(
          checkInPayload({
            protocolId: ownProtocol.id,
            professionalId: otherProfessional.id,
          }),
        );

      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(conflict.status).toBe(400);
      expect(conflict.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('rejeita payload legado, IDs de ownership e responses abusivas', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);

      const legacy = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send({
          ...checkInPayload(),
          athleteId: athlete.id,
          answers: { notes: 'Formato antigo.' },
          status: 'submitted',
        });
      const nested = await request(app)
        .post('/api/v1/check-ins')
        .set('Authorization', authorization(athlete))
        .send(
          checkInPayload({
            responses: { nested: { unsafe: true } },
          }),
        );

      expect(legacy.status).toBe(400);
      expect(legacy.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(nested.status).toBe(400);
      expect(nested.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(await CheckIn.countDocuments()).toBe(0);
    });

    it('impede duplicidade semanal sequencial e concorrente', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      const sendCreate = (referenceWeek = checkInPayload().referenceWeek) =>
        request(app)
          .post('/api/v1/check-ins')
          .set('Authorization', authorization(athlete))
          .send(checkInPayload({ referenceWeek }));

      const concurrent = await Promise.all([sendCreate(), sendCreate()]);
      const sequential = await sendCreate('2026-08-04T12:00:00-03:00');

      expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        concurrent.find(({ status }) => status === 409).body.error.code,
      ).toBe(ERROR_CODES.CHECKIN_ALREADY_EXISTS);
      expect(sequential.status).toBe(409);
      expect(sequential.body.error.code).toBe(
        ERROR_CODES.CHECKIN_ALREADY_EXISTS,
      );
      expect(await CheckIn.countDocuments()).toBe(1);
    });

    it('permite criação somente ao atleta autenticado', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');

      for (const requester of [admin, professional]) {
        const response = await request(app)
          .post('/api/v1/check-ins')
          .set('Authorization', authorization(requester))
          .send(checkInPayload());

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
      }
    });
  });

  describe('consultas', () => {
    it('aplica leitura global ao admin e ownership ao atleta', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const otherAthlete = await createUser('athlete');
      const own = await createCheckIn(professional, athlete);
      await createCheckIn(professional, otherAthlete, {
        referenceWeek: new Date('2026-08-10T03:00:00.000Z'),
      });

      const adminList = await request(app)
        .get('/api/v1/check-ins')
        .set('Authorization', authorization(admin));
      const athleteList = await request(app)
        .get('/api/v1/check-ins')
        .set('Authorization', authorization(athlete));
      const attemptedExpansion = await request(app)
        .get(`/api/v1/check-ins?athleteId=${otherAthlete.id}`)
        .set('Authorization', authorization(athlete));
      const ownGet = await request(app)
        .get(`/api/v1/check-ins/${own.id}`)
        .set('Authorization', authorization(athlete));

      expect(adminList.status).toBe(200);
      expect(adminList.body.data).toHaveLength(2);
      expect(athleteList.body.data).toHaveLength(1);
      expect(athleteList.body.data[0].athleteId).toBe(athlete.id);
      expect(attemptedExpansion.body.data).toHaveLength(0);
      expect(ownGet.status).toBe(200);
      expect(ownGet.body.data.id).toBe(own.id);
      expectSafeCheckIn(ownGet.body.data);
    });

    it('restringe profissional aprovado a atletas com vínculo active', async () => {
      const professional = await createUser('professional');
      const recordProfessional = await createUser('professional');
      const linkedAthlete = await createUser('athlete');
      const endedAthlete = await createUser('athlete');
      await createLink(professional, linkedAthlete);
      await createLink(professional, endedAthlete, 'ended');
      const visible = await createCheckIn(recordProfessional, linkedAthlete);
      const hidden = await createCheckIn(recordProfessional, endedAthlete, {
        referenceWeek: new Date('2026-08-10T03:00:00.000Z'),
      });

      const list = await request(app)
        .get('/api/v1/check-ins')
        .set('Authorization', authorization(professional));
      const visibleGet = await request(app)
        .get(`/api/v1/check-ins/${visible.id}`)
        .set('Authorization', authorization(professional));
      const hiddenGet = await request(app)
        .get(`/api/v1/check-ins/${hidden.id}`)
        .set('Authorization', authorization(professional));

      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].id).toBe(visible.id);
      expect(visibleGet.status).toBe(200);
      expect(hiddenGet.status).toBe(404);
      expect(hiddenGet.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });

    it.each([
      ['pending', ERROR_CODES.PROFESSIONAL_PENDING_APPROVAL],
      ['rejected', ERROR_CODES.PROFESSIONAL_REJECTED],
    ])(
      'bloqueia leitura para profissional %s',
      async (verificationStatus, expectedCode) => {
        const professional = await createUser('professional', {
          verificationStatus,
        });

        const response = await request(app)
          .get('/api/v1/check-ins')
          .set('Authorization', authorization(professional));

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(expectedCode);
      },
    );

    it('filtra, ordena e pagina de forma determinística', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const protocol = await createProtocol(professional, athlete);
      await createCheckIn(professional, athlete, {
        protocolId: protocol.id,
        status: 'submitted',
        referenceWeek: new Date('2026-08-03T03:00:00.000Z'),
      });
      await createCheckIn(professional, athlete, {
        protocolId: protocol.id,
        status: 'submitted',
        referenceWeek: new Date('2026-08-10T03:00:00.000Z'),
        submittedAt: new Date('2026-08-16T18:00:00.000Z'),
      });

      const response = await request(app)
        .get(
          `/api/v1/check-ins?athleteId=${athlete.id}&protocolId=${protocol.id}&status=submitted&dateFrom=2026-08-01T00:00:00.000Z&dateTo=2026-08-31T23:59:59.999Z&page=2&limit=1&sortBy=referenceWeek&sortOrder=asc`,
        )
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].referenceWeek).toBe(
        '2026-08-10T03:00:00.000Z',
      );
      expect(response.body.meta).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('rejeita filtros, ordenação e intervalos inválidos', async () => {
      const admin = await createUser('admin');

      const response = await request(app)
        .get(
          '/api/v1/check-ins?sortBy=status&dateFrom=2026-09-01T00:00:00.000Z&dateTo=2026-08-01T00:00:00.000Z&extra=true',
        )
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('oculta recurso externo e valida ObjectId', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);

      const hidden = await request(app)
        .get(`/api/v1/check-ins/${checkIn.id}`)
        .set('Authorization', authorization(outsider));
      const invalid = await request(app)
        .get('/api/v1/check-ins/id-invalido')
        .set('Authorization', authorization(athlete));

      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
    });
  });

  describe('PATCH /api/v1/check-ins/:id', () => {
    it('permite ao atleta dono substituir responses do pending', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}`)
        .set('Authorization', authorization(athlete))
        .send({ responses: { notes: '  Conteúdo preservado como enviado.  ' } });

      expect(response.status).toBe(200);
      expect(response.body.data.responses).toEqual({
        notes: '  Conteúdo preservado como enviado.  ',
      });
      expect(response.body.data.referenceWeek).toBe(
        checkIn.referenceWeek.toISOString(),
      );
    });

    it('rejeita campos imutáveis, formato legado, roles e ownership externo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);

      const immutable = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}`)
        .set('Authorization', authorization(athlete))
        .send({
          responses: { notes: 'Atualização.' },
          referenceWeek: '2026-08-10T00:00:00.000Z',
          protocolId: new mongoose.Types.ObjectId().toString(),
          answers: { notes: 'Legado.' },
        });
      const hidden = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}`)
        .set('Authorization', authorization(outsider))
        .send({ responses: { notes: 'Externo.' } });

      expect(immutable.status).toBe(400);
      expect(immutable.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(hidden.status).toBe(404);
      for (const requester of [admin, professional]) {
        const forbidden = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}`)
          .set('Authorization', authorization(requester))
          .send({ responses: { notes: 'Indevido.' } });
        expect(forbidden.status).toBe(403);
      }
    });

    it.each(['submitted', 'reviewed'])(
      'mantém responses imutáveis em %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const checkIn = await createCheckIn(professional, athlete, { status });

        const response = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}`)
          .set('Authorization', authorization(athlete))
          .send({ responses: { notes: 'Tentativa.' } });

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(
          ERROR_CODES.CHECKIN_ALREADY_SUBMITTED,
        );
        expect((await CheckIn.findById(checkIn.id)).responses.notes).not.toBe(
          'Tentativa.',
        );
      },
    );
  });

  describe('PATCH /api/v1/check-ins/:id/submit', () => {
    it('envia pending atomicamente e audita sem registrar responses', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('submitted');
      expect(response.body.data.submittedAt).toEqual(expect.any(String));
      expect(response.body.data.responses).toEqual(checkIn.responses);

      const audits = await AuditLog.find({
        action: AUDIT_ACTIONS.CHECKIN_SUBMITTED,
        entityId: checkIn.id,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: athlete._id,
        entityType: AUDIT_ENTITY_TYPES.CHECK_IN,
        metadata: { from: 'pending', to: 'submitted' },
      });
      expect(audits[0].metadata).not.toHaveProperty('responses');
    });

    it('faz somente uma transição e auditoria sob concorrência', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);
      const submit = () =>
        request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
          .set('Authorization', authorization(athlete))
          .send({});

      const responses = await Promise.all([submit(), submit()]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
      expect(
        responses.find(({ status }) => status === 422).body.error.code,
      ).toBe(ERROR_CODES.CHECKIN_ALREADY_SUBMITTED);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.CHECKIN_SUBMITTED,
          entityId: checkIn.id,
        }),
      ).toBe(1);
    });

    it.each(['submitted', 'reviewed'])(
      'rejeita novo submit de check-in %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const checkIn = await createCheckIn(professional, athlete, { status });

        const response = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
          .set('Authorization', authorization(athlete))
          .send({});

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(
          ERROR_CODES.CHECKIN_ALREADY_SUBMITTED,
        );
      },
    );

    it('revalida responses persistidas antes do envio', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);
      await CheckIn.collection.updateOne(
        { _id: checkIn._id },
        { $set: { responses: { nested: { unsafe: true } } } },
      );

      const response = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect((await CheckIn.findById(checkIn.id)).status).toBe('pending');
      expect(await AuditLog.countDocuments()).toBe(0);
    });

    it('aplica ownership, role, params e body vazio', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const checkIn = await createCheckIn(professional, athlete);

      const hidden = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
        .set('Authorization', authorization(outsider))
        .send({});
      const invalidBody = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
        .set('Authorization', authorization(athlete))
        .send({ submittedAt: new Date().toISOString() });
      const invalidId = await request(app)
        .patch('/api/v1/check-ins/id-invalido/submit')
        .set('Authorization', authorization(athlete))
        .send({});

      expect(hidden.status).toBe(404);
      expect(invalidBody.status).toBe(400);
      expect(invalidId.status).toBe(400);
      expect(invalidId.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
      for (const requester of [admin, professional]) {
        const forbidden = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/submit`)
          .set('Authorization', authorization(requester))
          .send({});
        expect(forbidden.status).toBe(403);
      }
    });
  });

  describe('PATCH /api/v1/check-ins/:id/review', () => {
    it('permite revisão pelo profissional responsável aprovado e audita com metadata mínima', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      const checkIn = await createCheckIn(professional, athlete, {
        status: 'submitted',
      });

      const response = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/review`)
        .set('Authorization', authorization(professional))
        .send({ reviewComment: '  Feedback de acompanhamento.  ' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'reviewed',
        reviewedBy: professional.id,
        reviewComment: 'Feedback de acompanhamento.',
      });
      expect(response.body.data.reviewedAt).toEqual(expect.any(String));
      expect(response.body.data.responses).toEqual(checkIn.responses);

      const audits = await AuditLog.find({
        action: AUDIT_ACTIONS.CHECKIN_REVIEWED,
        entityId: checkIn.id,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: professional._id,
        entityType: AUDIT_ENTITY_TYPES.CHECK_IN,
        metadata: { from: 'submitted', to: 'reviewed' },
      });
      expect(audits[0].metadata).not.toHaveProperty('reviewComment');
    });

    it('rejeita pending e segunda revisão com códigos oficiais', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      const pending = await createCheckIn(professional, athlete);
      const reviewed = await createCheckIn(professional, athlete, {
        referenceWeek: new Date('2026-08-10T03:00:00.000Z'),
        status: 'reviewed',
      });

      const notSubmitted = await request(app)
        .patch(`/api/v1/check-ins/${pending.id}/review`)
        .set('Authorization', authorization(professional))
        .send({ reviewComment: 'Ainda não enviado.' });
      const repeated = await request(app)
        .patch(`/api/v1/check-ins/${reviewed.id}/review`)
        .set('Authorization', authorization(professional))
        .send({ reviewComment: 'Nova revisão.' });

      expect(notSubmitted.status).toBe(422);
      expect(notSubmitted.body.error.code).toBe(
        ERROR_CODES.CHECKIN_NOT_SUBMITTED,
      );
      expect(repeated.status).toBe(422);
      expect(repeated.body.error.code).toBe(
        ERROR_CODES.INVALID_STATE_TRANSITION,
      );
    });

    it('permite somente o profissional responsável e exige vínculo active', async () => {
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);
      await createLink(otherProfessional, athlete);
      const checkIn = await createCheckIn(professional, athlete, {
        status: 'submitted',
      });

      const hidden = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/review`)
        .set('Authorization', authorization(otherProfessional))
        .send({ reviewComment: 'Profissional incorreto.' });
      link.status = 'ended';
      link.endedAt = new Date();
      link.endedBy = professional.id;
      await link.save();
      const noLink = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/review`)
        .set('Authorization', authorization(professional))
        .send({ reviewComment: 'Vínculo encerrado.' });

      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(noLink.status).toBe(403);
      expect(noLink.body.error.code).toBe(ERROR_CODES.ATHLETE_LINK_REQUIRED);
      expect((await CheckIn.findById(checkIn.id)).status).toBe('submitted');
    });

    it.each([
      ['pending', ERROR_CODES.PROFESSIONAL_PENDING_APPROVAL],
      ['rejected', ERROR_CODES.PROFESSIONAL_REJECTED],
    ])(
      'bloqueia revisão por profissional %s',
      async (verificationStatus, expectedCode) => {
        const professional = await createUser('professional', {
          verificationStatus,
        });
        const athlete = await createUser('athlete');
        await createLink(professional, athlete);
        const checkIn = await createCheckIn(professional, athlete, {
          status: 'submitted',
        });

        const response = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/review`)
          .set('Authorization', authorization(professional))
          .send({ reviewComment: 'Tentativa.' });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(expectedCode);
      },
    );

    it('valida comentário, role e concorrência sem duplicar auditoria', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete);
      const checkIn = await createCheckIn(professional, athlete, {
        status: 'submitted',
      });

      const invalid = await request(app)
        .patch(`/api/v1/check-ins/${checkIn.id}/review`)
        .set('Authorization', authorization(professional))
        .send({ reviewComment: '   ' });
      expect(invalid.status).toBe(400);

      for (const requester of [admin, athlete]) {
        const forbidden = await request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/review`)
          .set('Authorization', authorization(requester))
          .send({ reviewComment: 'Tentativa.' });
        expect(forbidden.status).toBe(403);
      }

      const review = () =>
        request(app)
          .patch(`/api/v1/check-ins/${checkIn.id}/review`)
          .set('Authorization', authorization(professional))
          .send({ reviewComment: 'Revisão concorrente.' });
      const concurrent = await Promise.all([review(), review()]);

      expect(concurrent.map(({ status }) => status).sort()).toEqual([200, 422]);
      expect(
        concurrent.find(({ status }) => status === 422).body.error.code,
      ).toBe(ERROR_CODES.INVALID_STATE_TRANSITION);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.CHECKIN_REVIEWED,
          entityId: checkIn.id,
        }),
      ).toBe(1);
    });
  });

  it('retorna RESOURCE_NOT_FOUND para ObjectId válido inexistente nas mutações', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const missingId = new mongoose.Types.ObjectId();

    const update = await request(app)
      .patch(`/api/v1/check-ins/${missingId}`)
      .set('Authorization', authorization(athlete))
      .send({ responses: { notes: 'Atualização.' } });
    const submit = await request(app)
      .patch(`/api/v1/check-ins/${missingId}/submit`)
      .set('Authorization', authorization(athlete))
      .send({});
    const review = await request(app)
      .patch(`/api/v1/check-ins/${missingId}/review`)
      .set('Authorization', authorization(professional))
      .send({ reviewComment: 'Revisão.' });

    for (const response of [update, submit, review]) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    }
  });

  it('não oferece reabertura nem exclusão física', async () => {
    const admin = await createUser('admin');
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const checkIn = await createCheckIn(professional, athlete, {
      status: 'reviewed',
    });

    const reopenPost = await request(app)
      .post(`/api/v1/check-ins/${checkIn.id}/reopen`)
      .set('Authorization', authorization(admin))
      .send({});
    const reopenPatch = await request(app)
      .patch(`/api/v1/check-ins/${checkIn.id}/reopen`)
      .set('Authorization', authorization(admin))
      .send({});
    const deleted = await request(app)
      .delete(`/api/v1/check-ins/${checkIn.id}`)
      .set('Authorization', authorization(admin));
    const legacySubmit = await request(app)
      .post(`/api/v1/check-ins/${checkIn.id}/submit`)
      .set('Authorization', authorization(athlete))
      .send({});
    const legacyReview = await request(app)
      .post(`/api/v1/check-ins/${checkIn.id}/review`)
      .set('Authorization', authorization(professional))
      .send({ reviewComment: 'Alias antigo.' });

    expect(reopenPost.status).toBe(404);
    expect(reopenPatch.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(legacySubmit.status).toBe(404);
    expect(legacyReview.status).toBe(404);
    expect(await CheckIn.findById(checkIn.id)).not.toBeNull();
  });
});
