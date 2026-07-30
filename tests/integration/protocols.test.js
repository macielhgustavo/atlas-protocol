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
const ProtocolVersion = require('../../src/models/protocol-version');
const Substance = require('../../src/models/substance');
const User = require('../../src/models/user');
const { generateToken } = require('../../src/utils/jwt');

let passwordHash;

async function createUser(role, { verificationStatus = 'approved' } = {}) {
  const user = await User.create({
    name: `Usuário ${role}`,
    email: `${role}-${new mongoose.Types.ObjectId()}@example.com`,
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
      submittedAt: new Date(),
      reviewedAt: reviewed ? new Date() : null,
      reviewedBy: reviewed ? user.id : null,
      rejectionReason:
        verificationStatus === 'rejected' ? 'Documento rejeitado.' : null,
    });
  }

  return user;
}

async function createSubstance(admin, overrides = {}) {
  return Substance.create({
    name: `Substância ${new mongoose.Types.ObjectId()}`,
    category: 'supplement',
    defaultUnit: 'g',
    active: true,
    createdBy: admin.id,
    ...overrides,
  });
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

async function endLink(link) {
  await ProfessionalAthleteLink.updateOne(
    { _id: link.id },
    {
      $set: {
        status: 'ended',
        endedAt: new Date(),
        endedBy: link.professionalId,
      },
    },
  );
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

function protocolPayload(athlete, substance, overrides = {}) {
  return {
    athleteId: athlete.id,
    title: 'Protocolo de acompanhamento',
    objective: 'Organização do acompanhamento.',
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-10-01T00:00:00.000Z',
    continuous: false,
    items: [
      {
        substanceId: substance.id,
        instructions: 'Informação registrada pelo profissional.',
        frequencyType: 'weekly',
        weekDays: [1, 4],
        time: '08:00',
      },
    ],
    ...overrides,
  };
}

async function createProtocolThroughApi(
  professional,
  athlete,
  substance,
  overrides,
) {
  return request(app)
    .post('/api/v1/protocols')
    .set('Authorization', authorization(professional))
    .send(protocolPayload(athlete, substance, overrides));
}

async function changeStatusThroughApi(
  professional,
  protocolId,
  status,
  reason,
) {
  const body = { status };
  if (reason !== undefined) body.reason = reason;

  return request(app)
    .patch(`/api/v1/protocols/${protocolId}/status`)
    .set('Authorization', authorization(professional))
    .send(body);
}

async function createVersionThroughApi(professional, protocolId, payload) {
  return request(app)
    .post(`/api/v1/protocols/${protocolId}/versions`)
    .set('Authorization', authorization(professional))
    .send(payload);
}

function expectStatusHistoryEntry(entry, expected) {
  expect(entry).toMatchObject({
    ...expected,
    changedAt: expect.any(String),
    changedBy: expected.changedBy,
  });
  expect(Object.keys(entry).sort()).toEqual(
    ['changedAt', 'changedBy', 'from', 'reason', 'to'].sort(),
  );
}

describe('protocolos e versionamento', () => {
  let mongoServer;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('SenhaForte123!', 10);
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Promise.all([
      ProfessionalAthleteLink.init(),
      Protocol.init(),
      ProtocolVersion.init(),
      Substance.init(),
    ]);
  }, 120000);

  afterEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      ProtocolVersion.deleteMany({}),
      Protocol.deleteMany({}),
      ProfessionalAthleteLink.deleteMany({}),
      ProfessionalProfile.deleteMany({}),
      Substance.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('POST /api/v1/protocols', () => {
    it('cria draft, versão inicial, histórico inicial e uma única auditoria de criação', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin, { name: 'Creatina' });
      await createActiveLink(professional, athlete);

      const response = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );

      expect(response.status).toBe(201);
      expect(response.body.data.protocol).toMatchObject({
        athleteId: athlete.id,
        professionalId: professional.id,
        status: 'draft',
        currentVersion: 1,
      });
      expect(response.body.data.currentVersion).toMatchObject({
        version: 1,
        createdBy: professional.id,
      });
      expect(response.body.data.currentVersion.items[0]).toMatchObject({
        substanceId: substance.id,
        substanceSnapshot: { name: 'Creatina', category: 'supplement' },
        frequencyType: 'weekly',
        weekDays: [1, 4],
      });
      expect(response.body.data.currentVersion.items[0]).not.toHaveProperty(
        'dosage',
      );

      const { protocol: protocolResponse } = response.body.data;
      expect(protocolResponse.statusHistory).toHaveLength(1);
      expectStatusHistoryEntry(protocolResponse.statusHistory[0], {
        from: null,
        to: 'draft',
        reason: null,
        changedBy: professional.id,
      });
      expect(protocolResponse.statusHistory[0].changedAt).toBe(
        protocolResponse.createdAt,
      );

      expect(await Protocol.countDocuments()).toBe(1);
      expect(await ProtocolVersion.countDocuments()).toBe(1);
      const protocol = await Protocol.findOne({});
      expect(protocol.statusHistory).toHaveLength(1);
      expect(protocol.statusHistory[0]).toMatchObject({
        from: null,
        to: 'draft',
        reason: null,
        changedBy: professional._id,
      });
      expect(protocol.statusHistory[0].changedAt.getTime()).toBe(
        protocol.createdAt.getTime(),
      );

      const creationLogs = await AuditLog.find({
        action: AUDIT_ACTIONS.PROTOCOL_CREATED,
        entityId: protocol._id,
      });
      expect(creationLogs).toHaveLength(1);
      expect(creationLogs[0]).toMatchObject({
        actorId: professional._id,
        entityType: AUDIT_ENTITY_TYPES.PROTOCOL,
        entityId: protocol._id,
        metadata: { status: 'draft', version: 1 },
      });
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
          entityId: protocol._id,
        }),
      ).toBe(0);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
          entityId: protocol._id,
        }),
      ).toBe(0);
      expect(JSON.stringify(creationLogs[0].metadata)).not.toMatch(
        /items|instructions/i,
      );
    });

    it('valida weekDays conforme o tipo de frequência', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);

      const validWeekly = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        {
          items: [
            {
              substanceId: substance.id,
              frequencyType: 'weekly',
              weekDays: [1, 7],
            },
          ],
        },
      );
      const invalidItems = [
        { frequencyType: 'weekly', weekDays: [] },
        { frequencyType: 'weekly', weekDays: [0] },
        { frequencyType: 'weekly', weekDays: [8] },
        { frequencyType: 'daily', weekDays: [1] },
      ];
      const invalidResponses = [];

      for (const item of invalidItems) {
        invalidResponses.push(
          await createProtocolThroughApi(
            professional,
            athlete,
            substance,
            {
              items: [{ substanceId: substance.id, ...item }],
            },
          ),
        );
      }

      expect(validWeekly.status).toBe(201);
      expect(
        validWeekly.body.data.currentVersion.items[0].weekDays,
      ).toEqual([1, 7]);
      for (const response of invalidResponses) {
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      expect(await Protocol.countDocuments()).toBe(1);
      expect(await ProtocolVersion.countDocuments()).toBe(1);
    });

    it('retorna ATHLETE_LINK_REQUIRED e não persiste parcialmente sem vínculo ativo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);

      const response = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
      expect(await Protocol.countDocuments()).toBe(0);
      expect(await ProtocolVersion.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments()).toBe(0);
    });

    it.each(['pending', 'rejected', 'ended'])(
      'não reconhece vínculo %s como vínculo ativo',
      async (status) => {
        const admin = await createUser('admin');
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const substance = await createSubstance(admin);
        const now = new Date();
        const transitionFields = {
          pending: {},
          rejected: { rejectedAt: now },
          ended: {
            acceptedAt: now,
            endedAt: now,
            endedBy: professional.id,
          },
        };

        await ProfessionalAthleteLink.create({
          professionalId: professional.id,
          athleteId: athlete.id,
          status,
          requestedAt: now,
          ...transitionFields[status],
        });

        const response = await createProtocolThroughApi(
          professional,
          athlete,
          substance,
        );

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
        expect(await Protocol.countDocuments()).toBe(0);
        expect(await ProtocolVersion.countDocuments()).toBe(0);
        expect(await AuditLog.countDocuments()).toBe(0);
      },
    );

    it.each(['admin', 'athlete'])(
      'impede criação pelo perfil %s',
      async (role) => {
        const admin = await createUser('admin');
        const requester = role === 'admin' ? admin : await createUser(role);
        const athlete = await createUser('athlete');
        const substance = await createSubstance(admin);

        const response = await createProtocolThroughApi(
          requester,
          athlete,
          substance,
        );

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      },
    );

    it('bloqueia profissional pendente antes de criar protocolo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional', {
        verificationStatus: 'pending',
      });
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);

      const response = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PROFESSIONAL_PENDING_APPROVAL');
      expect(await Protocol.countDocuments()).toBe(0);
    });

    it('rejeita atleta inexistente ou com perfil incompatível', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const substance = await createSubstance(admin);
      const missing = { id: new mongoose.Types.ObjectId().toString() };

      const missingResponse = await createProtocolThroughApi(
        professional,
        missing,
        substance,
      );
      await createActiveLink(professional, admin);
      const wrongRoleResponse = await createProtocolThroughApi(
        professional,
        admin,
        substance,
      );

      expect(missingResponse.status).toBe(404);
      expect(missingResponse.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(wrongRoleResponse.status).toBe(400);
      expect(wrongRoleResponse.body.error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['inexistente', 'missing'],
      ['inativa', 'inactive'],
    ])('rejeita substância %s', async (_case, kind) => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createActiveLink(professional, athlete);
      const substance =
        kind === 'missing'
          ? { id: new mongoose.Types.ObjectId().toString() }
          : await createSubstance(admin, { active: false });

      const response = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );

      expect(response.status).toBe(kind === 'missing' ? 404 : 400);
      expect(response.body.error.code).toBe(
        kind === 'missing' ? 'RESOURCE_NOT_FOUND' : 'VALIDATION_ERROR',
      );
      expect(await Protocol.countDocuments()).toBe(0);
      expect(await ProtocolVersion.countDocuments()).toBe(0);
    });

    it('rejeita IDs externos, ObjectId inválido, datas inconsistentes e statusHistory do cliente', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);

      const injectedProfessional = await request(app)
        .post('/api/v1/protocols')
        .set('Authorization', authorization(professional))
        .send({
          ...protocolPayload(athlete, substance),
          professionalId: professional.id,
        });
      const invalidId = await request(app)
        .post('/api/v1/protocols')
        .set('Authorization', authorization(professional))
        .send({ ...protocolPayload(athlete, substance), athleteId: 'inválido' });
      const invalidDates = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        {
          startDate: '2026-10-01T00:00:00.000Z',
          endDate: '2026-08-01T00:00:00.000Z',
        },
      );
      const injectedHistory = await request(app)
        .post('/api/v1/protocols')
        .set('Authorization', authorization(professional))
        .send({
          ...protocolPayload(athlete, substance),
          statusHistory: [{ from: null, to: 'draft' }],
        });

      expect(injectedProfessional.body.error.code).toBe('VALIDATION_ERROR');
      expect(invalidId.body.error.code).toBe('INVALID_OBJECT_ID');
      expect(invalidDates.body.error.code).toBe('VALIDATION_ERROR');
      expect(injectedHistory.body.error.code).toBe('VALIDATION_ERROR');
      expect(await Protocol.countDocuments()).toBe(0);
    });
  });

  describe('consulta e listagem', () => {
    it('restringe listagem por perfil, impede filtros de ampliar escopo e pagina', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      const otherAthlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      await createActiveLink(otherProfessional, otherAthlete);
      await createProtocolThroughApi(professional, athlete, substance);
      await createProtocolThroughApi(otherProfessional, otherAthlete, substance);

      const professionalList = await request(app)
        .get(`/api/v1/protocols?professionalId=${otherProfessional.id}`)
        .set('Authorization', authorization(professional));
      const athleteList = await request(app)
        .get(`/api/v1/protocols?athleteId=${otherAthlete.id}`)
        .set('Authorization', authorization(athlete));
      const adminList = await request(app)
        .get('/api/v1/protocols?page=1&limit=1')
        .set('Authorization', authorization(admin));

      expect(professionalList.body.data).toHaveLength(1);
      expect(professionalList.body.data[0].professionalId).toBe(professional.id);
      expect(professionalList.body.data[0]).not.toHaveProperty('statusHistory');
      expect(athleteList.body.data).toHaveLength(1);
      expect(athleteList.body.data[0].athleteId).toBe(athlete.id);
      expect(adminList.body.meta).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
    });

    it('filtra por status e datas e aplica ordenação documentada', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      await createProtocolThroughApi(professional, athlete, substance);
      await createProtocolThroughApi(professional, athlete, substance, {
        title: 'Outro protocolo',
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-02-01T00:00:00.000Z',
      });

      const response = await request(app)
        .get(
          '/api/v1/protocols?status=draft&dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-12-31T23:59:59.999Z&sortBy=startDate&sortOrder=asc',
        )
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].startDate).toBe('2026-08-01T00:00:00.000Z');
    });

    it.each(['admin', 'professional', 'athlete'])(
      'permite consulta individual e expõe histórico seguro ao perfil relacionado %s',
      async (role) => {
        const admin = await createUser('admin');
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const substance = await createSubstance(admin);
        await createActiveLink(professional, athlete);
        const created = await createProtocolThroughApi(
          professional,
          athlete,
          substance,
        );
        const requester = { admin, professional, athlete }[role];

        const response = await request(app)
          .get(`/api/v1/protocols/${created.body.data.protocol.id}`)
          .set('Authorization', authorization(requester));

        expect(response.status).toBe(200);
        expect(response.body.data.currentVersion.version).toBe(1);
        expect(response.body.data.protocol.statusHistory).toHaveLength(1);
        expectStatusHistoryEntry(
          response.body.data.protocol.statusHistory[0],
          {
            from: null,
            to: 'draft',
            reason: null,
            changedBy: professional.id,
          },
        );
      },
    );

    it('oculta protocolo de usuário externo e valida identificador', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );

      const hidden = await request(app)
        .get(`/api/v1/protocols/${created.body.data.protocol.id}`)
        .set('Authorization', authorization(outsider));
      const invalid = await request(app)
        .get('/api/v1/protocols/id-invalido')
        .set('Authorization', authorization(admin));

      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(invalid.body.error.code).toBe('INVALID_OBJECT_ID');
    });
  });

  describe('edição de draft e proteção de mutações', () => {
    it('edita somente draft, atualiza a versão inicial e preserva statusHistory', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      const initialHistory = created.body.data.protocol.statusHistory;

      const response = await request(app)
        .patch(`/api/v1/protocols/${protocolId}`)
        .set('Authorization', authorization(professional))
        .send({
          title: 'Rascunho atualizado',
          startDate: '2026-08-15T00:00:00.000Z',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.protocol).toMatchObject({
        title: 'Rascunho atualizado',
        status: 'draft',
        currentVersion: 1,
        statusHistory: initialHistory,
      });
      expect(response.body.data.currentVersion).toMatchObject({
        version: 1,
        startDate: '2026-08-15T00:00:00.000Z',
      });
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: {
            $in: [
              AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
              AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
            ],
          },
        }),
      ).toBe(0);
    });

    it('exige autenticação, perfil profissional aprovado e ownership nas rotas mutáveis', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;

      const unauthenticatedResponses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .send({ title: 'Sem autenticação' }),
        request(app)
          .post(`/api/v1/protocols/${protocolId}/versions`)
          .send({ startDate: '2026-08-15T00:00:00.000Z' }),
        request(app)
          .patch(`/api/v1/protocols/${protocolId}/status`)
          .send({ status: 'active' }),
      ]);
      expect(unauthenticatedResponses.map(({ status }) => status)).toEqual([
        401, 401, 401,
      ]);

      const roleResponses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .set('Authorization', authorization(athlete))
          .send({ title: 'Atleta' }),
        request(app)
          .post(`/api/v1/protocols/${protocolId}/versions`)
          .set('Authorization', authorization(admin))
          .send({ startDate: '2026-08-15T00:00:00.000Z' }),
      ]);
      expect(roleResponses.map(({ status }) => status)).toEqual([403, 403]);

      const hidden = await changeStatusThroughApi(
        otherProfessional,
        protocolId,
        'active',
      );
      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe('RESOURCE_NOT_FOUND');

      await ProfessionalProfile.updateOne(
        { userId: professional.id },
        {
          $set: {
            verificationStatus: 'pending',
            reviewedAt: null,
            reviewedBy: null,
          },
        },
      );
      const pendingResponses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .set('Authorization', authorization(professional))
          .send({ title: 'Pendente' }),
        createVersionThroughApi(professional, protocolId, {
          startDate: '2026-08-15T00:00:00.000Z',
        }),
        changeStatusThroughApi(professional, protocolId, 'active'),
      ]);
      for (const response of pendingResponses) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(
          'PROFESSIONAL_PENDING_APPROVAL',
        );
      }

      const protocol = await Protocol.findById(protocolId);
      expect(protocol).toMatchObject({ status: 'draft', currentVersion: 1 });
      expect(protocol.statusHistory).toHaveLength(1);
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
    });

    it('retorna ATHLETE_LINK_REQUIRED nas três mutações do owner sem vínculo ativo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      const link = await createActiveLink(professional, athlete);
      const draft = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const active = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        { title: 'Protocolo ativo' },
      );
      await changeStatusThroughApi(
        professional,
        active.body.data.protocol.id,
        'active',
      );
      await endLink(link);

      const responses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${draft.body.data.protocol.id}`)
          .set('Authorization', authorization(professional))
          .send({ title: 'Sem vínculo' }),
        createVersionThroughApi(
          professional,
          active.body.data.protocol.id,
          { startDate: '2026-08-15T00:00:00.000Z' },
        ),
        changeStatusThroughApi(
          professional,
          active.body.data.protocol.id,
          'paused',
        ),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
      }
      expect(
        await ProtocolVersion.countDocuments({
          protocolId: active.body.data.protocol.id,
        }),
      ).toBe(1);
      const activeProtocol = await Protocol.findById(
        active.body.data.protocol.id,
      );
      expect(activeProtocol.status).toBe('active');
      expect(activeProtocol.statusHistory).toHaveLength(2);
    });

    it('rejeita PATCH direto em active, paused, closed e cancelled sem criar versões', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const published = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const publishedId = published.body.data.protocol.id;

      await changeStatusThroughApi(professional, publishedId, 'active');
      for (const status of ['active', 'paused', 'closed']) {
        if (status === 'paused') {
          await changeStatusThroughApi(professional, publishedId, 'paused');
        }
        if (status === 'closed') {
          await changeStatusThroughApi(professional, publishedId, 'closed');
        }
        const response = await request(app)
          .patch(`/api/v1/protocols/${publishedId}`)
          .set('Authorization', authorization(professional))
          .send({ title: `Tentativa em ${status}` });
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('PROTOCOL_READ_ONLY');
      }

      const draft = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        { title: 'Protocolo cancelado' },
      );
      const cancelledId = draft.body.data.protocol.id;
      await changeStatusThroughApi(professional, cancelledId, 'cancelled');
      const cancelledUpdate = await request(app)
        .patch(`/api/v1/protocols/${cancelledId}`)
        .set('Authorization', authorization(professional))
        .send({ title: 'Tentativa cancelada' });

      expect(cancelledUpdate.status).toBe(422);
      expect(cancelledUpdate.body.error.code).toBe('PROTOCOL_READ_ONLY');
      expect(await ProtocolVersion.countDocuments({ protocolId: publishedId })).toBe(
        1,
      );
      expect(await ProtocolVersion.countDocuments({ protocolId: cancelledId })).toBe(
        1,
      );
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
        }),
      ).toBe(0);
    });

    it('serializa corrida entre edição do draft e ativação sem produzir versão vazia ou divergente', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;

      const [draftUpdate, statusUpdate] = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .set('Authorization', authorization(professional))
          .send({
            startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-11-01T00:00:00.000Z',
            items: [],
          }),
        changeStatusThroughApi(professional, protocolId, 'active'),
      ]);

      expect([
        [200, 400],
        [422, 200],
      ]).toContainEqual([draftUpdate.status, statusUpdate.status]);

      const protocol = await Protocol.findById(protocolId);
      const version = await ProtocolVersion.findOne({
        protocolId,
        version: protocol.currentVersion,
      });
      expect(protocol.currentVersion).toBe(1);
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(protocol.startDate.getTime()).toBe(version.startDate.getTime());
      expect(protocol.endDate.getTime()).toBe(version.endDate.getTime());
      expect(protocol.statusHistory.at(-1).to).toBe(protocol.status);
      expect(protocol.status !== 'active' || version.items.length > 0).toBe(true);

      if (draftUpdate.status === 200) {
        expect(statusUpdate.body.error.code).toBe('PROTOCOL_EMPTY');
        expect(protocol.status).toBe('draft');
        expect(protocol.statusHistory).toHaveLength(1);
        expect(version.items).toHaveLength(0);
        expect(protocol.startDate.toISOString()).toBe(
          '2026-09-01T00:00:00.000Z',
        );
      } else {
        expect(draftUpdate.body.error.code).toBe('PROTOCOL_READ_ONLY');
        expect(protocol.status).toBe('active');
        expect(protocol.statusHistory).toHaveLength(2);
        expect(version.items).toHaveLength(1);
        expect(protocol.startDate.toISOString()).toBe(
          '2026-08-01T00:00:00.000Z',
        );
      }

      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
        }),
      ).toBe(statusUpdate.status === 200 ? 1 : 0);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
        }),
      ).toBe(0);
    });

    it('bloqueia mutações de protocolo legado sem statusHistory até migração', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin, { name: 'Item legado' });
      await createActiveLink(professional, athlete);
      const protocolId = new mongoose.Types.ObjectId();
      const now = new Date();

      await Protocol.collection.insertOne({
        _id: protocolId,
        athleteId: athlete._id,
        professionalId: professional._id,
        title: 'Protocolo legado',
        objective: null,
        status: 'draft',
        currentVersion: 1,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
        continuous: false,
        activatedAt: null,
        pausedAt: null,
        closedAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      });
      await ProtocolVersion.create({
        protocolId,
        version: 1,
        createdBy: professional.id,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T00:00:00.000Z'),
        continuous: false,
        items: [
          {
            substanceId: substance.id,
            substanceSnapshot: {
              name: substance.name,
              category: substance.category,
            },
            frequencyType: 'daily',
          },
        ],
      });

      const responses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .set('Authorization', authorization(professional))
          .send({ title: 'Tentativa de editar legado' }),
        createVersionThroughApi(professional, protocolId, {
          startDate: '2026-08-15T00:00:00.000Z',
        }),
        changeStatusThroughApi(professional, protocolId, 'active'),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('PROTOCOL_READ_ONLY');
      }

      const rawProtocol = await Protocol.collection.findOne({ _id: protocolId });
      expect(rawProtocol).not.toHaveProperty('statusHistory');
      expect(rawProtocol).toMatchObject({
        title: 'Protocolo legado',
        status: 'draft',
        currentVersion: 1,
      });
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: {
            $in: [
              AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
              AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
            ],
          },
        }),
      ).toBe(0);
    });

    it('não aceita campos de histórico gerenciados pelo backend em nenhum payload', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;

      const responses = await Promise.all([
        request(app)
          .patch(`/api/v1/protocols/${protocolId}`)
          .set('Authorization', authorization(professional))
          .send({ statusHistory: [] }),
        request(app)
          .post(`/api/v1/protocols/${protocolId}/versions`)
          .set('Authorization', authorization(professional))
          .send({
            startDate: '2026-08-15T00:00:00.000Z',
            statusHistory: [],
          }),
        request(app)
          .patch(`/api/v1/protocols/${protocolId}/status`)
          .set('Authorization', authorization(professional))
          .send({ status: 'active', changedBy: professional.id }),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
      const protocol = await Protocol.findById(protocolId);
      expect(protocol.status).toBe('draft');
      expect(protocol.statusHistory).toHaveLength(1);
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: {
            $in: [
              AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
              AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
            ],
          },
        }),
      ).toBe(0);
    });
  });

  describe('POST /api/v1/protocols/:id/versions', () => {
    it('preserva itens omitidos e rejeita versão vazia em active e paused', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin, { name: 'Creatina' });
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      const originalItems = created.body.data.currentVersion.items;

      await changeStatusThroughApi(professional, protocolId, 'active');
      const changedDates = await createVersionThroughApi(
        professional,
        protocolId,
        {
          startDate: '2026-08-15T00:00:00.000Z',
        },
      );
      const emptyWhileActive = await createVersionThroughApi(
        professional,
        protocolId,
        { items: [] },
      );
      await changeStatusThroughApi(
        professional,
        protocolId,
        'paused',
        'Pausa operacional.',
      );
      const emptyWhilePaused = await createVersionThroughApi(
        professional,
        protocolId,
        { items: [] },
      );

      expect(changedDates.status).toBe(201);
      expect(changedDates.body.data.currentVersion).toMatchObject({
        version: 2,
        startDate: '2026-08-15T00:00:00.000Z',
        items: originalItems,
      });
      for (const response of [emptyWhileActive, emptyWhilePaused]) {
        expect(response.status).toBe(400);
        expect(response.body.error).toMatchObject({
          code: 'PROTOCOL_EMPTY',
          message:
            'Uma nova versão de protocolo precisa possuir ao menos um item.',
        });
      }
      const protocol = await Protocol.findById(protocolId);
      expect(protocol).toMatchObject({ currentVersion: 2, status: 'paused' });
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(2);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
          entityId: protocolId,
        }),
      ).toBe(1);
    });

    it('cria versões sequenciais em active e paused sem alterar versões anteriores ou histórico de status', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin, { name: 'Creatina' });
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      const versionOneBefore = await ProtocolVersion.findOne({
        protocolId,
        version: 1,
      }).lean();

      await changeStatusThroughApi(professional, protocolId, 'active');
      const historyBeforeVersionTwo = (
        await Protocol.findById(protocolId).lean()
      ).statusHistory;
      const versionTwo = await createVersionThroughApi(
        professional,
        protocolId,
        {
          changeReason: '  Ajuste documentado.  ',
          startDate: '2026-08-15T00:00:00.000Z',
        },
      );
      await changeStatusThroughApi(
        professional,
        protocolId,
        'paused',
        'Pausa operacional.',
      );
      const historyBeforeVersionThree = (
        await Protocol.findById(protocolId).lean()
      ).statusHistory;
      const versionThree = await createVersionThroughApi(
        professional,
        protocolId,
        {
          changeReason: 'Nova revisão.',
          endDate: '2026-11-01T00:00:00.000Z',
        },
      );

      expect(versionTwo.status).toBe(201);
      expect(versionThree.status).toBe(201);
      expect(versionTwo.body.data.currentVersion).toMatchObject({
        version: 2,
        changeReason: 'Ajuste documentado.',
        startDate: '2026-08-15T00:00:00.000Z',
      });
      expect(versionThree.body.data.currentVersion).toMatchObject({
        version: 3,
        changeReason: 'Nova revisão.',
        endDate: '2026-11-01T00:00:00.000Z',
      });
      expect(versionTwo.body.data.protocol.statusHistory).toEqual(
        historyBeforeVersionTwo.map((entry) => ({
          from: entry.from,
          to: entry.to,
          reason: entry.reason,
          changedAt: entry.changedAt.toISOString(),
          changedBy: entry.changedBy.toString(),
        })),
      );
      expect(versionThree.body.data.protocol.statusHistory).toEqual(
        historyBeforeVersionThree.map((entry) => ({
          from: entry.from,
          to: entry.to,
          reason: entry.reason,
          changedAt: entry.changedAt.toISOString(),
          changedBy: entry.changedBy.toString(),
        })),
      );

      const versions = await ProtocolVersion.find({ protocolId }).sort({
        version: 1,
      });
      expect(versions).toHaveLength(3);
      expect(versions[0].toObject()).toEqual(versionOneBefore);
      expect(versions[0].items[0].substanceSnapshot.name).toBe('Creatina');
      expect(versions[1].items[0].substanceSnapshot.name).toBe('Creatina');
      expect(versions[2].items[0].substanceSnapshot.name).toBe('Creatina');
      expect(versions[0].startDate.toISOString()).toBe(
        '2026-08-01T00:00:00.000Z',
      );
      expect(versions[1].startDate.toISOString()).toBe(
        '2026-08-15T00:00:00.000Z',
      );
      expect(versions[2].endDate.toISOString()).toBe(
        '2026-11-01T00:00:00.000Z',
      );

      const protocol = await Protocol.findById(protocolId);
      expect(protocol).toMatchObject({ currentVersion: 3, status: 'paused' });
      expect(protocol.statusHistory).toHaveLength(3);
      const versionAuditLogs = await AuditLog.find({
        action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
        entityId: protocolId,
      }).sort({ createdAt: 1, _id: 1 });
      expect(versionAuditLogs).toHaveLength(2);
      expect(versionAuditLogs.map(({ metadata }) => metadata)).toEqual([
        { previousVersion: 1, newVersion: 2 },
        { previousVersion: 2, newVersion: 3 },
      ]);
      expect(JSON.stringify(versionAuditLogs)).not.toMatch(
        /items|instructions/i,
      );
    });

    it('rejeita campo material igual ao atual sem criar versão ou auditoria', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      await changeStatusThroughApi(professional, protocolId, 'active');

      const response = await createVersionThroughApi(
        professional,
        protocolId,
        {
          startDate: '2026-08-01T00:00:00.000Z',
          changeReason: 'Campo material sem alteração efetiva.',
        },
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      const protocol = await Protocol.findById(protocolId);
      expect(protocol).toMatchObject({ currentVersion: 1, status: 'active' });
      expect(protocol.statusHistory).toHaveLength(2);
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
        }),
      ).toBe(0);
    });

    it('rejeita estados e payloads inválidos sem versão parcial ou auditoria', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;

      const draftVersion = await createVersionThroughApi(
        professional,
        protocolId,
        { startDate: '2026-08-15T00:00:00.000Z' },
      );
      expect(draftVersion.status).toBe(422);
      expect(draftVersion.body.error.code).toBe('INVALID_STATE_TRANSITION');

      await changeStatusThroughApi(professional, protocolId, 'active');
      const reasonOnly = await createVersionThroughApi(
        professional,
        protocolId,
        { changeReason: 'Sem alteração material.' },
      );
      const invalidDates = await createVersionThroughApi(
        professional,
        protocolId,
        {
          startDate: '2026-12-01T00:00:00.000Z',
          endDate: '2026-11-01T00:00:00.000Z',
        },
      );
      const missingSubstance = await createVersionThroughApi(
        professional,
        protocolId,
        {
          items: [
            {
              substanceId: new mongoose.Types.ObjectId().toString(),
              frequencyType: 'daily',
            },
          ],
        },
      );

      expect(reasonOnly.status).toBe(400);
      expect(reasonOnly.body.error.code).toBe('VALIDATION_ERROR');
      expect(invalidDates.status).toBe(400);
      expect(invalidDates.body.error.code).toBe('VALIDATION_ERROR');
      expect(missingSubstance.status).toBe(404);
      expect(missingSubstance.body.error.code).toBe('RESOURCE_NOT_FOUND');

      const protocol = await Protocol.findById(protocolId);
      expect(protocol).toMatchObject({ currentVersion: 1, status: 'active' });
      expect(protocol.statusHistory).toHaveLength(2);
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_VERSION_CREATED,
          entityId: protocolId,
        }),
      ).toBe(0);
    });

    it('lista versões e retorna snapshot histórico específico', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      await changeStatusThroughApi(professional, protocolId, 'active');
      await createVersionThroughApi(professional, protocolId, {
        startDate: '2026-08-15T00:00:00.000Z',
        changeReason: 'Revisão.',
      });

      const list = await request(app)
        .get(`/api/v1/protocols/${protocolId}/versions`)
        .set('Authorization', authorization(athlete));
      const historical = await request(app)
        .get(`/api/v1/protocols/${protocolId}/versions/1`)
        .set('Authorization', authorization(admin));

      expect(list.status).toBe(200);
      expect(list.body.data.map(({ version }) => version)).toEqual([1, 2]);
      expect(historical.status).toBe(200);
      expect(historical.body.data.version.startDate).toBe(
        '2026-08-01T00:00:00.000Z',
      );
      expect(historical.body.data.version.startDate).not.toBe(
        '2026-08-15T00:00:00.000Z',
      );
    });
  });

  describe('PATCH /api/v1/protocols/:id/status', () => {
    it('não ativa protocolo vazio e não cria histórico ou auditoria da tentativa', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        { items: [] },
      );
      const protocolId = created.body.data.protocol.id;

      const response = await changeStatusThroughApi(
        professional,
        protocolId,
        'active',
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROTOCOL_EMPTY');
      const protocol = await Protocol.findById(protocolId);
      expect(protocol.status).toBe('draft');
      expect(protocol.statusHistory).toHaveLength(1);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
          entityId: protocolId,
        }),
      ).toBe(0);
    });

    it('mantém histórico append-only, reasons e timestamps em múltiplos ciclos até closed', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;
      const transitionResponses = [];

      transitionResponses.push(
        await changeStatusThroughApi(professional, protocolId, 'active'),
      );
      transitionResponses.push(
        await changeStatusThroughApi(
          professional,
          protocolId,
          'paused',
          '  Primeira pausa.  ',
        ),
      );
      transitionResponses.push(
        await changeStatusThroughApi(professional, protocolId, 'active'),
      );
      transitionResponses.push(
        await changeStatusThroughApi(
          professional,
          protocolId,
          'paused',
          'Segunda pausa.',
        ),
      );
      transitionResponses.push(
        await changeStatusThroughApi(
          professional,
          protocolId,
          'active',
          '  Retomada final.  ',
        ),
      );
      transitionResponses.push(
        await changeStatusThroughApi(
          professional,
          protocolId,
          'closed',
          'Encerramento.',
        ),
      );

      let previousHistory = created.body.data.protocol.statusHistory;
      for (const response of transitionResponses) {
        expect(response.status).toBe(200);
        const currentHistory = response.body.data.protocol.statusHistory;
        expect(currentHistory).toHaveLength(previousHistory.length + 1);
        expect(currentHistory.slice(0, previousHistory.length)).toEqual(
          previousHistory,
        );
        previousHistory = currentHistory;
      }

      const finalProtocol = transitionResponses.at(-1).body.data.protocol;
      expect(finalProtocol.status).toBe('closed');
      expect(finalProtocol.statusHistory).toHaveLength(7);
      expect(
        finalProtocol.statusHistory.map(({ from, to, reason, changedBy }) => ({
          from,
          to,
          reason,
          changedBy,
        })),
      ).toEqual([
        { from: null, to: 'draft', reason: null, changedBy: professional.id },
        {
          from: 'draft',
          to: 'active',
          reason: null,
          changedBy: professional.id,
        },
        {
          from: 'active',
          to: 'paused',
          reason: 'Primeira pausa.',
          changedBy: professional.id,
        },
        {
          from: 'paused',
          to: 'active',
          reason: null,
          changedBy: professional.id,
        },
        {
          from: 'active',
          to: 'paused',
          reason: 'Segunda pausa.',
          changedBy: professional.id,
        },
        {
          from: 'paused',
          to: 'active',
          reason: 'Retomada final.',
          changedBy: professional.id,
        },
        {
          from: 'active',
          to: 'closed',
          reason: 'Encerramento.',
          changedBy: professional.id,
        },
      ]);
      for (let index = 1; index < finalProtocol.statusHistory.length; index += 1) {
        expect(
          Date.parse(finalProtocol.statusHistory[index].changedAt),
        ).toBeGreaterThanOrEqual(
          Date.parse(finalProtocol.statusHistory[index - 1].changedAt),
        );
      }

      const firstActivation = transitionResponses[0].body.data.protocol;
      const firstPause = transitionResponses[1].body.data.protocol;
      const firstResume = transitionResponses[2].body.data.protocol;
      const secondPause = transitionResponses[3].body.data.protocol;
      const secondResume = transitionResponses[4].body.data.protocol;
      expect(firstActivation.activatedAt).toBe(
        firstActivation.statusHistory[1].changedAt,
      );
      expect(firstPause.pausedAt).toBe(firstPause.statusHistory[2].changedAt);
      expect(firstResume.pausedAt).toBe(firstPause.pausedAt);
      expect(firstResume.activatedAt).toBe(firstActivation.activatedAt);
      expect(secondPause.pausedAt).toBe(secondPause.statusHistory[4].changedAt);
      expect(secondResume.pausedAt).toBe(secondPause.pausedAt);
      expect(secondResume.activatedAt).toBe(firstActivation.activatedAt);
      expect(finalProtocol.pausedAt).toBe(secondPause.pausedAt);
      expect(finalProtocol.activatedAt).toBe(firstActivation.activatedAt);
      expect(finalProtocol.closedAt).toBe(
        finalProtocol.statusHistory[6].changedAt,
      );
      expect(finalProtocol).not.toHaveProperty('resumedAt');
      expect(await ProtocolVersion.countDocuments({ protocolId })).toBe(1);

      const statusAuditLogs = await AuditLog.find({
        action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
        entityId: protocolId,
      }).sort({ createdAt: 1, _id: 1 });
      expect(statusAuditLogs).toHaveLength(6);
      expect(statusAuditLogs.map(({ metadata }) => metadata)).toEqual([
        { from: 'draft', to: 'active' },
        { from: 'active', to: 'paused', reason: 'Primeira pausa.' },
        { from: 'paused', to: 'active' },
        { from: 'active', to: 'paused', reason: 'Segunda pausa.' },
        { from: 'paused', to: 'active', reason: 'Retomada final.' },
        { from: 'active', to: 'closed', reason: 'Encerramento.' },
      ]);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_CREATED,
          entityId: protocolId,
        }),
      ).toBe(1);

      const rejectedReopen = await changeStatusThroughApi(
        professional,
        protocolId,
        'active',
      );
      expect(rejectedReopen.status).toBe(422);
      expect(rejectedReopen.body.error.code).toBe('INVALID_STATE_TRANSITION');
      const afterRejectedReopen = await Protocol.findById(protocolId);
      expect(afterRejectedReopen.statusHistory).toHaveLength(7);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
          entityId: protocolId,
        }),
      ).toBe(6);
    });

    it('permite paused→closed, cancela somente draft e mantém estados finais', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);

      const closable = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        { title: 'Protocolo para encerrar' },
      );
      const closableId = closable.body.data.protocol.id;
      await changeStatusThroughApi(professional, closableId, 'active');
      await changeStatusThroughApi(professional, closableId, 'paused');
      const closed = await changeStatusThroughApi(
        professional,
        closableId,
        'closed',
      );

      expect(closed.status).toBe(200);
      expect(closed.body.data.protocol.statusHistory).toHaveLength(4);
      expect(closed.body.data.protocol.statusHistory[3]).toMatchObject({
        from: 'paused',
        to: 'closed',
        reason: null,
      });
      expect(closed.body.data.protocol.closedAt).toBe(
        closed.body.data.protocol.statusHistory[3].changedAt,
      );

      const cancellable = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
        { title: 'Protocolo para cancelar' },
      );
      const cancellableId = cancellable.body.data.protocol.id;
      const cancelled = await changeStatusThroughApi(
        professional,
        cancellableId,
        'cancelled',
        '  Rascunho descartado.  ',
      );

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.protocol.statusHistory).toHaveLength(2);
      expect(cancelled.body.data.protocol.statusHistory[1]).toMatchObject({
        from: 'draft',
        to: 'cancelled',
        reason: 'Rascunho descartado.',
      });
      expect(cancelled.body.data.protocol.cancelledAt).toBe(
        cancelled.body.data.protocol.statusHistory[1].changedAt,
      );

      const finalStateAttempts = await Promise.all([
        changeStatusThroughApi(professional, closableId, 'active'),
        changeStatusThroughApi(professional, cancellableId, 'active'),
      ]);
      for (const response of finalStateAttempts) {
        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe('INVALID_STATE_TRANSITION');
      }

      expect(
        await AuditLog.countDocuments({
          entityId: closableId,
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
        }),
      ).toBe(3);
      expect(
        await AuditLog.countDocuments({
          entityId: cancellableId,
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
        }),
      ).toBe(1);
      expect((await Protocol.findById(closableId)).statusHistory).toHaveLength(4);
      expect((await Protocol.findById(cancellableId)).statusHistory).toHaveLength(
        2,
      );
    });

    it('valida payload e não registra tentativas inválidas', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const substance = await createSubstance(admin);
      await createActiveLink(professional, athlete);
      const created = await createProtocolThroughApi(
        professional,
        athlete,
        substance,
      );
      const protocolId = created.body.data.protocol.id;

      const invalidBodies = [
        {},
        { status: 'desconhecido' },
        { status: 'active', reason: 123 },
        { status: 'active', reason: 'x'.repeat(501) },
        { status: 'active', pausedAt: new Date().toISOString() },
      ];

      for (const body of invalidBodies) {
        const response = await request(app)
          .patch(`/api/v1/protocols/${protocolId}/status`)
          .set('Authorization', authorization(professional))
          .send(body);
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }

      const protocol = await Protocol.findById(protocolId);
      expect(protocol.status).toBe('draft');
      expect(protocol.statusHistory).toHaveLength(1);
      expect(
        await AuditLog.countDocuments({
          entityId: protocolId,
          action: AUDIT_ACTIONS.PROTOCOL_STATUS_CHANGED,
        }),
      ).toBe(0);
    });
  });

  describe('rotas oficiais e remoção dos endpoints legados', () => {
    it.each(['activate', 'pause', 'close', 'cancel', 'resume'])(
      'retorna 404 para PATCH legado /:id/%s',
      async (legacyAction) => {
        const professional = await createUser('professional');
        const response = await request(app)
          .patch(
            `/api/v1/protocols/${new mongoose.Types.ObjectId()}/${legacyAction}`,
          )
          .set('Authorization', authorization(professional))
          .send({});

        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
      },
    );
  });
});
