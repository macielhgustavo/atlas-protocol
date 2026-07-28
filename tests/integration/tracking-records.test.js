const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../../src/constants/audit-entity-types');
const AuditLog = require('../../src/models/audit-log');
const ProfessionalAthleteLink = require('../../src/models/professional-athlete-link');
const ProfessionalProfile = require('../../src/models/professional-profile');
const Protocol = require('../../src/models/protocol');
const TrackingRecord = require('../../src/models/tracking-record');
const User = require('../../src/models/user');
const { generateToken } = require('../../src/utils/jwt');

let passwordHash;

async function createUser(role, { verificationStatus = 'approved', ...overrides } = {}) {
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
    passwordHash,
    role,
    ...overrides,
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
      submittedAt: new Date(),
      reviewedAt: reviewed ? new Date() : null,
      reviewedBy: reviewed ? user.id : null,
      rejectionReason:
        verificationStatus === 'rejected' ? 'Documento rejeitado.' : null,
    });
  }

  return user;
}

async function createActiveLink(professional, athlete) {
  const now = new Date();
  return ProfessionalAthleteLink.create({
    professionalId: professional.id,
    athleteId: athlete.id,
    status: 'active',
    requestedAt: now,
    acceptedAt: now,
  });
}

async function createProtocol(professional, athlete, status = 'active') {
  const now = new Date('2026-08-01T00:00:00.000Z');
  const statusHistory = [
    {
      from: null,
      to: 'draft',
      reason: null,
      changedAt: now,
      changedBy: professional.id,
    },
  ];

  if (!['draft', 'cancelled'].includes(status)) {
    statusHistory.push({
      from: 'draft',
      to: 'active',
      reason: null,
      changedAt: now,
      changedBy: professional.id,
    });
  }
  if (status === 'paused') {
    statusHistory.push({
      from: 'active',
      to: 'paused',
      reason: null,
      changedAt: now,
      changedBy: professional.id,
    });
  }
  if (status === 'closed') {
    statusHistory.push({
      from: 'active',
      to: 'closed',
      reason: null,
      changedAt: now,
      changedBy: professional.id,
    });
  }
  if (status === 'cancelled') {
    statusHistory.push({
      from: 'draft',
      to: 'cancelled',
      reason: null,
      changedAt: now,
      changedBy: professional.id,
    });
  }

  return Protocol.create({
    athleteId: athlete.id,
    professionalId: professional.id,
    title: `Protocolo ${new mongoose.Types.ObjectId()}`,
    status,
    currentVersion: 3,
    startDate: now,
    endDate: null,
    continuous: true,
    activatedAt: status === 'draft' || status === 'cancelled' ? null : now,
    pausedAt: status === 'paused' ? now : null,
    closedAt: status === 'closed' ? now : null,
    cancelledAt: status === 'cancelled' ? now : null,
    statusHistory,
  });
}

async function createTrackingRecord({
  athlete,
  professional = null,
  createdBy = professional || athlete,
  ...overrides
}) {
  const status = overrides.status || 'scheduled';
  return TrackingRecord.create({
    athleteId: athlete.id,
    professionalId: professional ? professional.id : null,
    protocolId: null,
    protocolVersion: null,
    type: 'manual',
    title: `Registro ${new mongoose.Types.ObjectId()}`,
    scheduledFor: new Date('2026-08-05T11:00:00.000Z'),
    status,
    statusReason:
      status === 'missed' || status === 'cancelled'
        ? 'Motivo registrado.'
        : null,
    completedAt:
      status === 'completed'
        ? new Date('2026-08-05T11:10:00.000Z')
        : null,
    completedBy: status === 'completed' ? createdBy.id : null,
    notes: 'Informação sem interpretação clínica.',
    createdBy: createdBy.id,
    ...overrides,
  });
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

function professionalPayload(athlete, overrides = {}) {
  return {
    athleteId: athlete.id,
    type: 'manual',
    title: 'Registro de acompanhamento',
    scheduledFor: '2026-08-05T11:00:00.000Z',
    notes: 'Observação informativa.',
    ...overrides,
  };
}

function athletePayload(overrides = {}) {
  return {
    type: 'manual',
    title: 'Registro manual próprio',
    scheduledFor: '2026-08-05T11:00:00.000Z',
    notes: 'Observação do atleta.',
    ...overrides,
  };
}

describe('Tracking Records V1', () => {
  let mongoServer;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('SenhaForte123!', 10);
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Promise.all([
      AuditLog.init(),
      ProfessionalAthleteLink.init(),
      TrackingRecord.init(),
    ]);
  }, 120000);

  afterEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      TrackingRecord.deleteMany({}),
      Protocol.deleteMany({}),
      ProfessionalAthleteLink.deleteMany({}),
      ProfessionalProfile.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it.each([
    [
      'post',
      '/api/v1/tracking-records',
      {
        type: 'manual',
        title: 'Registro sem autenticação',
        scheduledFor: '2026-08-05T11:00:00.000Z',
      },
    ],
    ['get', '/api/v1/tracking-records', null],
    [
      'get',
      `/api/v1/tracking-records/${new mongoose.Types.ObjectId()}`,
      null,
    ],
    [
      'patch',
      `/api/v1/tracking-records/${new mongoose.Types.ObjectId()}/status`,
      { status: 'completed' },
    ],
    [
      'patch',
      `/api/v1/tracking-records/${new mongoose.Types.ObjectId()}/correction`,
      { notes: 'Correção.', reason: 'Motivo.' },
    ],
  ])(
    '%s %s exige autenticação',
    async (method, path, body) => {
      let operation = request(app)[method](path);
      if (body) operation = operation.send(body);

      const response = await operation;

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    },
  );

  it.each([
    ['get', '/api/v1/tracking-records/id-invalido', null, 'athlete'],
    [
      'patch',
      '/api/v1/tracking-records/id-invalido/status',
      { status: 'completed' },
      'athlete',
    ],
    [
      'patch',
      '/api/v1/tracking-records/id-invalido/correction',
      { notes: 'Correção.', reason: 'Motivo.' },
      'admin',
    ],
  ])(
    '%s %s rejeita ObjectId inválido',
    async (method, path, body, role) => {
      const user = await createUser(role);
      let operation = request(app)[method](path).set(
        'Authorization',
        authorization(user),
      );
      if (body) operation = operation.send(body);

      const response = await operation;

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_OBJECT_ID');
    },
  );

  describe('POST /api/v1/tracking-records', () => {
    it('profissional approved e vinculado cria e deriva campos internos', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      const protocol = await createProtocol(professional, athlete);

      const response = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(professional))
        .send(
          professionalPayload(athlete, {
            protocolId: protocol.id,
            type: 'scheduled',
          }),
        );

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        athleteId: athlete.id,
        professionalId: professional.id,
        protocolId: protocol.id,
        protocolVersion: 3,
        type: 'scheduled',
        status: 'scheduled',
        statusReason: null,
        completedAt: null,
        completedBy: null,
        createdBy: professional.id,
      });
      expect(await AuditLog.countDocuments({
        action: AUDIT_ACTIONS.TRACKING_CREATED,
        actorId: professional.id,
        entityType: AUDIT_ENTITY_TYPES.TRACKING_RECORD,
      })).toBe(1);
    });

    it('atleta cria somente manual próprio sem profissional ou protocolo', async () => {
      const athlete = await createUser('athlete');

      const response = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(athlete))
        .send(athletePayload());

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        athleteId: athlete.id,
        professionalId: null,
        protocolId: null,
        protocolVersion: null,
        type: 'manual',
        createdBy: athlete.id,
      });
      expect(response.body.data).not.toHaveProperty('passwordHash');
      expect(response.body.data).not.toHaveProperty('protocolItemId');
      expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    });

    it.each([
      ['athleteId', () => ({ athleteId: new mongoose.Types.ObjectId() })],
      ['protocolId', () => ({ protocolId: new mongoose.Types.ObjectId() })],
      ['type', () => ({ type: 'scheduled' })],
    ])('atleta não pode controlar %s', async (_field, inputFactory) => {
      const athlete = await createUser('athlete');

      const response = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(athlete))
        .send(athletePayload(inputFactory()));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(await TrackingRecord.countDocuments()).toBe(0);
    });

    it.each([
      ['pending', 'PROFESSIONAL_PENDING_APPROVAL'],
      ['rejected', 'PROFESSIONAL_REJECTED'],
    ])(
      'profissional %s não cria tracking',
      async (verificationStatus, errorCode) => {
        const professional = await createUser('professional', {
          verificationStatus,
        });
        const athlete = await createUser('athlete');
        await createActiveLink(professional, athlete);

        const response = await request(app)
          .post('/api/v1/tracking-records')
          .set('Authorization', authorization(professional))
          .send(professionalPayload(athlete));

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(errorCode);
      },
    );

    it('exige vínculo active e usa ATHLETE_LINK_REQUIRED', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');

      const response = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(professional))
        .send(professionalPayload(athlete));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
    });

    it('não revela se athleteId fora do vínculo existe', async () => {
      const professional = await createUser('professional');
      const unrelatedAthlete = await createUser('athlete');
      const unknownAthleteId = new mongoose.Types.ObjectId().toString();

      const existingResponse = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(professional))
        .send(professionalPayload(unrelatedAthlete));
      const missingResponse = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(professional))
        .send(
          professionalPayload({ id: unknownAthleteId }),
        );

      expect(existingResponse.status).toBe(403);
      expect(missingResponse.status).toBe(403);
      expect(existingResponse.body.error).toEqual(
        missingResponse.body.error,
      );
      expect(existingResponse.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
    });

    it.each(['draft', 'paused', 'closed', 'cancelled'])(
      'rejeita protocolo %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        await createActiveLink(professional, athlete);
        const protocol = await createProtocol(professional, athlete, status);

        const response = await request(app)
          .post('/api/v1/tracking-records')
          .set('Authorization', authorization(professional))
          .send(
            professionalPayload(athlete, { protocolId: protocol.id }),
          );

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      },
    );

    it('rejeita IDs internos, campo legado e payload desconhecido', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);

      const response = await request(app)
        .post('/api/v1/tracking-records')
        .set('Authorization', authorization(professional))
        .send({
          ...professionalPayload(athlete),
          professionalId: professional.id,
          createdBy: professional.id,
          protocolItemId: 'legado',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/tracking-records', () => {
    it('aplica ownership, vínculo active e filtros sem ampliar escopo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      await createActiveLink(professional, athlete);
      await createTrackingRecord({
        professional,
        athlete,
        scheduledFor: new Date('2026-08-05T10:00:00.000Z'),
      });
      await createTrackingRecord({
        athlete,
        scheduledFor: new Date('2026-08-06T10:00:00.000Z'),
      });
      await createTrackingRecord({
        athlete: outsider,
        scheduledFor: new Date('2026-08-07T10:00:00.000Z'),
      });

      const professionalResponse = await request(app)
        .get('/api/v1/tracking-records?type=manual')
        .set('Authorization', authorization(professional));
      const attemptedExpansion = await request(app)
        .get(`/api/v1/tracking-records?athleteId=${outsider.id}`)
        .set('Authorization', authorization(professional));
      const athleteResponse = await request(app)
        .get('/api/v1/tracking-records')
        .set('Authorization', authorization(athlete));
      const adminResponse = await request(app)
        .get('/api/v1/tracking-records?page=2&limit=1')
        .set('Authorization', authorization(admin));

      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.data).toHaveLength(2);
      expect(attemptedExpansion.body.data).toHaveLength(0);
      expect(athleteResponse.body.data).toHaveLength(2);
      expect(adminResponse.body.meta).toEqual({
        page: 2,
        limit: 1,
        total: 3,
        totalPages: 3,
      });
    });

    it('filtra status, protocolo, tipo e intervalo com ordenação oficial', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const protocol = await createProtocol(professional, athlete);
      await createTrackingRecord({
        professional,
        athlete,
        protocolId: protocol.id,
        protocolVersion: 3,
        type: 'scheduled',
        status: 'missed',
        statusReason: 'Não realizado.',
        scheduledFor: new Date('2026-08-05T10:00:00.000Z'),
      });
      await createTrackingRecord({
        professional,
        athlete,
        scheduledFor: new Date('2026-08-06T10:00:00.000Z'),
      });

      const response = await request(app)
        .get(
          `/api/v1/tracking-records?athleteId=${athlete.id}&protocolId=${protocol.id}&status=missed&type=scheduled&dateFrom=2026-08-05T00:00:00.000Z&dateTo=2026-08-05T23:59:59.999Z&sortBy=createdAt&sortOrder=desc`,
        )
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        protocolId: protocol.id,
        status: 'missed',
        type: 'scheduled',
      });
    });

    it.each([
      'from=2026-08-01T00:00:00.000Z',
      'to=2026-08-02T00:00:00.000Z',
      `professionalId=${new mongoose.Types.ObjectId()}`,
      'sortBy=updatedAt',
      'dateFrom=2026-08-03T00:00:00.000Z&dateTo=2026-08-02T00:00:00.000Z',
    ])('rejeita query fora do contrato: %s', async (query) => {
      const admin = await createUser('admin');
      const response = await request(app)
        .get(`/api/v1/tracking-records?${query}`)
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/tracking-records/:id', () => {
    it('permite admin, atleta dono e profissional approved vinculado', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      const trackingRecord = await createTrackingRecord({ athlete });

      for (const requester of [admin, professional, athlete]) {
        const response = await request(app)
          .get(`/api/v1/tracking-records/${trackingRecord.id}`)
          .set('Authorization', authorization(requester));

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(trackingRecord.id);
      }
    });

    it('oculta recurso fora do ownership ou após fim do vínculo', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const link = await createActiveLink(professional, athlete);
      const trackingRecord = await createTrackingRecord({ athlete });
      await ProfessionalAthleteLink.updateOne(
        { _id: link.id },
        {
          $set: {
            status: 'ended',
            endedAt: new Date(),
            endedBy: professional.id,
          },
        },
      );

      for (const requester of [professional, outsider]) {
        const response = await request(app)
          .get(`/api/v1/tracking-records/${trackingRecord.id}`)
          .set('Authorization', authorization(requester));

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });

  describe('PATCH /api/v1/tracking-records/:id/status', () => {
    it('atleta conclui tracking próprio com campos coerentes e auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({
        professional,
        athlete,
      });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({
          status: 'completed',
          completedAt: '2026-08-05T11:15:00.000Z',
          notes: 'Concluído pelo atleta.',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'completed',
        statusReason: null,
        completedAt: '2026-08-05T11:15:00.000Z',
        completedBy: athlete.id,
        notes: 'Concluído pelo atleta.',
      });
      expect(await AuditLog.countDocuments({
        action: AUDIT_ACTIONS.TRACKING_STATUS_CHANGED,
        actorId: athlete.id,
        entityId: trackingRecord.id,
      })).toBe(1);
    });

    it.each(['missed', 'cancelled'])(
      'profissional vinculado marca %s com statusReason',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        await createActiveLink(professional, athlete);
        const trackingRecord = await createTrackingRecord({
          professional,
          athlete,
        });

        const response = await request(app)
          .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
          .set('Authorization', authorization(professional))
          .send({ status, reason: ' Motivo normalizado. ' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
          status,
          statusReason: 'Motivo normalizado.',
          completedAt: null,
          completedBy: null,
        });
      },
    );

    it('atleta cancela somente manual próprio criado por ele', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const ownManual = await createTrackingRecord({ athlete });
      const professionalRecord = await createTrackingRecord({
        professional,
        athlete,
      });

      const allowed = await request(app)
        .patch(`/api/v1/tracking-records/${ownManual.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({ status: 'cancelled', reason: 'Cancelamento próprio.' });
      const forbidden = await request(app)
        .patch(`/api/v1/tracking-records/${professionalRecord.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({ status: 'cancelled', reason: 'Tentativa indevida.' });

      expect(allowed.status).toBe(200);
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe('FORBIDDEN');
    });

    it('atleta nunca marca missed', async () => {
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({ athlete });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({ status: 'missed', reason: 'Tentativa.' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('somente uma transição concorrente vence e gera auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      const trackingRecord = await createTrackingRecord({
        professional,
        athlete,
      });

      const responses = await Promise.all([
        request(app)
          .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
          .set('Authorization', authorization(professional))
          .send({ status: 'missed', reason: 'Primeira possibilidade.' }),
        request(app)
          .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
          .set('Authorization', authorization(professional))
          .send({ status: 'cancelled', reason: 'Segunda possibilidade.' }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200,
        422,
      ]);
      expect(await AuditLog.countDocuments({
        action: AUDIT_ACTIONS.TRACKING_STATUS_CHANGED,
        entityId: trackingRecord.id,
      })).toBe(1);
    });

    it.each([
      ['pending', 'PROFESSIONAL_PENDING_APPROVAL'],
      ['rejected', 'PROFESSIONAL_REJECTED'],
    ])(
      'profissional %s não altera status nem corrige',
      async (verificationStatus, errorCode) => {
        const professional = await createUser('professional', {
          verificationStatus,
        });
        const athlete = await createUser('athlete');
        await createActiveLink(professional, athlete);
        const scheduled = await createTrackingRecord({
          professional,
          athlete,
        });
        const finalized = await createTrackingRecord({
          professional,
          athlete,
          status: 'completed',
        });

        const transitionResponse = await request(app)
          .patch(`/api/v1/tracking-records/${scheduled.id}/status`)
          .set('Authorization', authorization(professional))
          .send({ status: 'completed' });
        const correctionResponse = await request(app)
          .patch(`/api/v1/tracking-records/${finalized.id}/correction`)
          .set('Authorization', authorization(professional))
          .send({
            notes: 'Tentativa.',
            reason: 'Sem aprovação.',
          });

        expect(transitionResponse.status).toBe(403);
        expect(transitionResponse.body.error.code).toBe(errorCode);
        expect(correctionResponse.status).toBe(403);
        expect(correctionResponse.body.error.code).toBe(errorCode);
      },
    );

    it('estado final não transiciona novamente', async () => {
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({
        athlete,
        status: 'cancelled',
      });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({ status: 'scheduled' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('scheduled não transiciona para scheduled', async () => {
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({ athlete });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/status`)
        .set('Authorization', authorization(athlete))
        .send({ status: 'scheduled' });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
    });
  });

  describe('PATCH /api/v1/tracking-records/:id/correction', () => {
    it('admin corrige notes de tracking finalizado e audita sem snapshot', async () => {
      const admin = await createUser('admin');
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({
        athlete,
        status: 'cancelled',
      });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/correction`)
        .set('Authorization', authorization(admin))
        .send({
          notes: 'Informação corrigida.',
          reason: ' Erro de digitação. ',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        status: 'cancelled',
        statusReason: 'Motivo registrado.',
        notes: 'Informação corrigida.',
      });
      const auditLog = await AuditLog.findOne({
        action: AUDIT_ACTIONS.TRACKING_CORRECTED,
        entityId: trackingRecord.id,
      }).lean();
      expect(auditLog.metadata).toEqual({
        field: 'notes',
        reason: 'Erro de digitação.',
      });
      expect(JSON.stringify(auditLog.metadata)).not.toContain(
        'Informação corrigida.',
      );
    });

    it('profissional responsável e vinculado corrige registro finalizado', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      const trackingRecord = await createTrackingRecord({
        professional,
        athlete,
        status: 'completed',
      });

      const response = await request(app)
        .patch(`/api/v1/tracking-records/${trackingRecord.id}/correction`)
        .set('Authorization', authorization(professional))
        .send({
          notes: 'Texto corrigido.',
          reason: 'Correção necessária.',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('completed');
    });

    it('rejeita atleta, profissional não responsável e registro scheduled', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const outsider = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      await createActiveLink(outsider, athlete);
      const finalized = await createTrackingRecord({
        professional,
        athlete,
        status: 'missed',
      });
      const scheduled = await createTrackingRecord({
        professional,
        athlete,
      });
      const payload = {
        notes: 'Tentativa.',
        reason: 'Motivo.',
      };

      const athleteResponse = await request(app)
        .patch(`/api/v1/tracking-records/${finalized.id}/correction`)
        .set('Authorization', authorization(athlete))
        .send(payload);
      const outsiderResponse = await request(app)
        .patch(`/api/v1/tracking-records/${finalized.id}/correction`)
        .set('Authorization', authorization(outsider))
        .send(payload);
      const scheduledResponse = await request(app)
        .patch(`/api/v1/tracking-records/${scheduled.id}/correction`)
        .set('Authorization', authorization(admin))
        .send(payload);

      expect(athleteResponse.status).toBe(403);
      expect(outsiderResponse.status).toBe(404);
      expect(scheduledResponse.status).toBe(422);
    });
  });

  it('não expõe PATCH genérico nem DELETE físico', async () => {
    const admin = await createUser('admin');
    const athlete = await createUser('athlete');
    const trackingRecord = await createTrackingRecord({ athlete });

    const genericPatch = await request(app)
      .patch(`/api/v1/tracking-records/${trackingRecord.id}`)
      .set('Authorization', authorization(admin))
      .send({ notes: 'Não permitido.' });
    const deletion = await request(app)
      .delete(`/api/v1/tracking-records/${trackingRecord.id}`)
      .set('Authorization', authorization(admin));

    expect(genericPatch.status).toBe(404);
    expect(deletion.status).toBe(404);
    expect(await TrackingRecord.findById(trackingRecord.id)).not.toBeNull();
  });

  it.each(['complete', 'miss', 'cancel'])(
    'não expõe endpoint legado POST /:id/%s',
    async (action) => {
      const athlete = await createUser('athlete');
      const trackingRecord = await createTrackingRecord({ athlete });

      const response = await request(app)
        .post(`/api/v1/tracking-records/${trackingRecord.id}/${action}`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(response.status).toBe(404);
      expect((await TrackingRecord.findById(trackingRecord.id)).status).toBe(
        'scheduled',
      );
    },
  );
});
