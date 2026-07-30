const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../../src/constants/audit-entity-types');
const ERROR_CODES = require('../../src/constants/error-codes');
const AuditLog = require('../../src/models/audit-log');
const ProfessionalAthleteLink = require('../../src/models/professional-athlete-link');
const ProfessionalProfile = require('../../src/models/professional-profile');
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
  status = 'pending',
  overrides = {},
) {
  const now = new Date();
  const transitionFields = {
    acceptedAt: ['active', 'ended'].includes(status) ? now : null,
    rejectedAt: status === 'rejected' ? now : null,
    endedAt: status === 'ended' ? now : null,
    endedBy: status === 'ended' ? professional.id : null,
  };

  return ProfessionalAthleteLink.create({
    professionalId: professional.id,
    athleteId: athlete.id,
    status,
    requestedAt: now,
    ...transitionFields,
    ...overrides,
  });
}

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

function expectSafeLink(link) {
  expect(link).not.toHaveProperty('passwordHash');
  expect(link).not.toHaveProperty('athleteEmail');
  expect(link).not.toHaveProperty('invitedBy');
  expect(link).not.toHaveProperty('startedAt');
  expect(link).not.toHaveProperty('rejectionReason');
  expect(link).not.toHaveProperty('endReason');
}

async function auditFor(action, linkId) {
  return AuditLog.findOne({
    action,
    entityType: AUDIT_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
    entityId: linkId,
  });
}

describe('Links V2', () => {
  let mongoServer;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('SenhaForte123!', 4);
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await Promise.all([
      AuditLog.init(),
      ProfessionalAthleteLink.init(),
      ProfessionalProfile.init(),
      User.init(),
    ]);
  }, 120000);

  afterEach(async () => {
    await Promise.all([
      AuditLog.deleteMany({}),
      ProfessionalAthleteLink.deleteMany({}),
      ProfessionalProfile.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('materializa o índice único parcial para vínculos pending ou active', async () => {
    const indexes = await ProfessionalAthleteLink.collection.indexes();
    const openLinkIndex = indexes.find(
      (index) => index.name === 'unique_open_professional_athlete_link',
    );

    expect(openLinkIndex).toMatchObject({
      key: { professionalId: 1, athleteId: 1 },
      unique: true,
      partialFilterExpression: {
        status: { $in: ['pending', 'active'] },
      },
    });
  });

  it.each([
    ['POST /links', 'post', '/api/v1/links', { athleteEmail: 'a@b.com' }],
    ['GET /links', 'get', '/api/v1/links', undefined],
    [
      'GET /links/:id',
      'get',
      `/api/v1/links/${new mongoose.Types.ObjectId()}`,
      undefined,
    ],
    [
      'PATCH /links/:id/accept',
      'patch',
      `/api/v1/links/${new mongoose.Types.ObjectId()}/accept`,
      {},
    ],
    [
      'PATCH /links/:id/reject',
      'patch',
      `/api/v1/links/${new mongoose.Types.ObjectId()}/reject`,
      {},
    ],
    [
      'PATCH /links/:id/end',
      'patch',
      `/api/v1/links/${new mongoose.Types.ObjectId()}/end`,
      {},
    ],
  ])('exige autenticação em %s', async (_label, method, endpoint, body) => {
    let call = request(app)[method](endpoint);
    if (body !== undefined) call = call.send(body);

    const response = await call;

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe(ERROR_CODES.AUTH_REQUIRED);
  });

  describe('POST /api/v1/links', () => {
    it('normaliza o e-mail, cria pending e audita uma única solicitação segura', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete', {
        email: 'target.athlete@example.com',
      });

      const response = await request(app)
        .post('/api/v1/links')
        .set('Authorization', authorization(professional))
        .send({ athleteEmail: '  TARGET.ATHLETE@EXAMPLE.COM  ' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        professionalId: professional.id,
        athleteId: athlete.id,
        status: 'pending',
        acceptedAt: null,
        rejectedAt: null,
        endedAt: null,
        endedBy: null,
      });
      expect(response.body.data.requestedAt).toEqual(expect.any(String));
      expectSafeLink(response.body.data);

      const stored = await ProfessionalAthleteLink.findById(
        response.body.data.id,
      );
      expect(stored).toMatchObject({
        professionalId: professional._id,
        athleteId: athlete._id,
        status: 'pending',
      });

      const audits = await AuditLog.find({
        action: AUDIT_ACTIONS.LINK_REQUESTED,
        entityId: stored._id,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: professional._id,
        entityType: AUDIT_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
        entityId: stored._id,
        metadata: { from: null, to: 'pending' },
      });
      expect(JSON.stringify(audits[0].metadata)).not.toContain(
        athlete.email,
      );
    });

    it.each(['admin', 'athlete'])(
      'impede solicitação pelo perfil %s',
      async (role) => {
        const requester = await createUser(role);
        const athlete = await createUser('athlete');

        const response = await request(app)
          .post('/api/v1/links')
          .set('Authorization', authorization(requester))
          .send({ athleteEmail: athlete.email });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
        expect(await ProfessionalAthleteLink.countDocuments()).toBe(0);
      },
    );

    it.each([
      ['pending', true, ERROR_CODES.PROFESSIONAL_PENDING_APPROVAL],
      ['rejected', true, ERROR_CODES.PROFESSIONAL_REJECTED],
      [
        'sem perfil',
        false,
        ERROR_CODES.PROFESSIONAL_VERIFICATION_REQUIRED,
      ],
    ])(
      'impede solicitação por profissional %s',
      async (verificationStatus, withProfessionalProfile, expectedCode) => {
        const professional = await createUser('professional', {
          verificationStatus:
            verificationStatus === 'sem perfil'
              ? 'approved'
              : verificationStatus,
          withProfessionalProfile,
        });
        const athlete = await createUser('athlete');

        const response = await request(app)
          .post('/api/v1/links')
          .set('Authorization', authorization(professional))
          .send({ athleteEmail: athlete.email });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(expectedCode);
        expect(await ProfessionalAthleteLink.countDocuments()).toBe(0);
      },
    );

    it.each([
      ['e-mail ausente', {}],
      ['e-mail inválido', { athleteEmail: 'invalido' }],
      [
        'professionalId do cliente',
        {
          athleteEmail: 'athlete@example.com',
          professionalId: new mongoose.Types.ObjectId().toString(),
        },
      ],
      [
        'athleteId do cliente',
        {
          athleteEmail: 'athlete@example.com',
          athleteId: new mongoose.Types.ObjectId().toString(),
        },
      ],
      [
        'status do cliente',
        { athleteEmail: 'athlete@example.com', status: 'active' },
      ],
    ])('rejeita payload com %s', async (_case, body) => {
      const professional = await createUser('professional');

      const response = await request(app)
        .post('/api/v1/links')
        .set('Authorization', authorization(professional))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(await ProfessionalAthleteLink.countDocuments()).toBe(0);
    });

    it('não distingue atleta inexistente, incompatível, inativo ou bloqueado', async () => {
      const professional = await createUser('professional');
      const wrongRole = await createUser('admin');
      const otherProfessional = await createUser('professional');
      const inactive = await createUser('athlete', { active: false });
      const blocked = await createUser('athlete', {
        blockedAt: new Date(),
      });
      const emails = [
        'missing@example.com',
        wrongRole.email,
        otherProfessional.email,
        inactive.email,
        blocked.email,
        professional.email,
      ];
      const responses = [];

      for (const athleteEmail of emails) {
        responses.push(
          await request(app)
            .post('/api/v1/links')
            .set('Authorization', authorization(professional))
            .send({ athleteEmail }),
        );
      }

      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe(
          ERROR_CODES.ATHLETE_NOT_AVAILABLE_FOR_LINK,
        );
        expect(response.body).toEqual(responses[0].body);
      }
      expect(await ProfessionalAthleteLink.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments()).toBe(0);
    });

    it.each([
      ['pending', ERROR_CODES.PENDING_LINK_ALREADY_EXISTS],
      ['active', ERROR_CODES.ACTIVE_LINK_ALREADY_EXISTS],
    ])(
      'impede solicitação quando já existe vínculo %s',
      async (status, expectedCode) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        await createLink(professional, athlete, status);

        const response = await request(app)
          .post('/api/v1/links')
          .set('Authorization', authorization(professional))
          .send({ athleteEmail: athlete.email });

        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe(expectedCode);
        expect(
          await ProfessionalAthleteLink.countDocuments({
            professionalId: professional.id,
            athleteId: athlete.id,
          }),
        ).toBe(1);
        expect(
          await AuditLog.countDocuments({
            action: AUDIT_ACTIONS.LINK_REQUESTED,
          }),
        ).toBe(0);
      },
    );

    it('permite nova solicitação após históricos rejected e ended', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      await createLink(professional, athlete, 'rejected');
      await createLink(professional, athlete, 'ended');

      const response = await request(app)
        .post('/api/v1/links')
        .set('Authorization', authorization(professional))
        .send({ athleteEmail: athlete.email });

      expect(response.status).toBe(201);
      expect(response.body.data.status).toBe('pending');
      expect(
        await ProfessionalAthleteLink.countDocuments({
          professionalId: professional.id,
          athleteId: athlete.id,
        }),
      ).toBe(3);
    });

    it('trata duas solicitações concorrentes com um único vínculo e uma auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const sendRequest = () =>
        request(app)
          .post('/api/v1/links')
          .set('Authorization', authorization(professional))
          .send({ athleteEmail: athlete.email });

      const responses = await Promise.all([sendRequest(), sendRequest()]);

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const conflict = responses.find(({ status }) => status === 409);
      expect(conflict.body.error.code).toBe(
        ERROR_CODES.PENDING_LINK_ALREADY_EXISTS,
      );
      expect(
        await ProfessionalAthleteLink.countDocuments({
          professionalId: professional.id,
          athleteId: athlete.id,
          status: 'pending',
        }),
      ).toBe(1);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.LINK_REQUESTED,
        }),
      ).toBe(1);
    });
  });

  describe('GET /api/v1/links', () => {
    it('aplica ownership para profissional e atleta e permite visão global ao admin', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const otherProfessional = await createUser('professional');
      const athlete = await createUser('athlete');
      const otherAthlete = await createUser('athlete');
      await createLink(professional, athlete, 'pending');
      await createLink(professional, otherAthlete, 'rejected');
      await createLink(otherProfessional, athlete, 'active');

      const [adminResponse, professionalResponse, athleteResponse] =
        await Promise.all([
          request(app)
            .get('/api/v1/links')
            .set('Authorization', authorization(admin)),
          request(app)
            .get('/api/v1/links')
            .set('Authorization', authorization(professional)),
          request(app)
            .get('/api/v1/links')
            .set('Authorization', authorization(athlete)),
        ]);

      expect(adminResponse.status).toBe(200);
      expect(adminResponse.body.data).toHaveLength(3);
      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.data).toHaveLength(2);
      expect(
        professionalResponse.body.data.every(
          (link) => link.professionalId === professional.id,
        ),
      ).toBe(true);
      expect(athleteResponse.status).toBe(200);
      expect(athleteResponse.body.data).toHaveLength(2);
      expect(
        athleteResponse.body.data.every(
          (link) => link.athleteId === athlete.id,
        ),
      ).toBe(true);
      expect(athleteResponse.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            professional: expect.objectContaining({
              id: professional.id,
              name: professional.name,
              email: professional.email,
            }),
          }),
          expect.objectContaining({
            professional: expect.objectContaining({
              id: otherProfessional.id,
              name: otherProfessional.name,
              email: otherProfessional.email,
            }),
          }),
        ]),
      );
      for (const link of adminResponse.body.data) expectSafeLink(link);
    });

    it('filtra e pagina no escopo permitido', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athleteOne = await createUser('athlete');
      const athleteTwo = await createUser('athlete');
      await createLink(professional, athleteOne, 'pending');
      await createLink(professional, athleteTwo, 'active');

      const adminResponse = await request(app)
        .get(
          `/api/v1/links?professionalId=${professional.id}&status=active&page=1&limit=1`,
        )
        .set('Authorization', authorization(admin));
      const professionalResponse = await request(app)
        .get(`/api/v1/links?athleteId=${athleteOne.id}`)
        .set('Authorization', authorization(professional));

      expect(adminResponse.status).toBe(200);
      expect(adminResponse.body.data).toHaveLength(1);
      expect(adminResponse.body.data[0].status).toBe('active');
      expect(adminResponse.body.meta).toEqual({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      });
      expect(professionalResponse.status).toBe(200);
      expect(professionalResponse.body.data).toHaveLength(1);
      expect(professionalResponse.body.data[0].athleteId).toBe(athleteOne.id);
    });

    it.each([
      ['professional', 'professionalId'],
      ['athlete', 'professionalId'],
      ['athlete', 'athleteId'],
    ])('impede o filtro %s para o perfil %s', async (role, field) => {
      const requester = await createUser(role);

      const response = await request(app)
        .get('/api/v1/links')
        .query({ [field]: new mongoose.Types.ObjectId().toString() })
        .set('Authorization', authorization(requester));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(response.body.error.fields[0].field).toBe(field);
    });

    it('ordena somente por createdAt ou requestedAt e usa createdAt desc por padrão', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const firstAthlete = await createUser('athlete');
      const secondAthlete = await createUser('athlete');
      const first = await createLink(professional, firstAthlete);
      const second = await createLink(professional, secondAthlete);
      await ProfessionalAthleteLink.collection.updateOne(
        { _id: first._id },
        {
          $set: {
            createdAt: new Date('2026-02-01T00:00:00.000Z'),
            requestedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
      );
      await ProfessionalAthleteLink.collection.updateOne(
        { _id: second._id },
        {
          $set: {
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            requestedAt: new Date('2026-02-01T00:00:00.000Z'),
          },
        },
      );

      const defaultResponse = await request(app)
        .get('/api/v1/links')
        .set('Authorization', authorization(admin));
      const requestedAtResponse = await request(app)
        .get('/api/v1/links?sortBy=requestedAt&sortOrder=desc')
        .set('Authorization', authorization(admin));

      expect(defaultResponse.body.data.map((link) => link.id)).toEqual([
        first.id,
        second.id,
      ]);
      expect(requestedAtResponse.body.data.map((link) => link.id)).toEqual([
        second.id,
        first.id,
      ]);
    });

    it.each([
      ['status inválido', { status: 'unknown' }, ERROR_CODES.VALIDATION_ERROR],
      ['limite inválido', { limit: 101 }, ERROR_CODES.VALIDATION_ERROR],
      [
        'sortBy arbitrário',
        { sortBy: 'updatedAt' },
        ERROR_CODES.VALIDATION_ERROR,
      ],
      [
        'sortOrder inválido',
        { sortOrder: 'sideways' },
        ERROR_CODES.VALIDATION_ERROR,
      ],
      ['busca ampla', { search: 'atleta' }, ERROR_CODES.VALIDATION_ERROR],
      [
        'professionalId inválido',
        { professionalId: 'id-invalido' },
        ERROR_CODES.INVALID_OBJECT_ID,
      ],
      [
        'athleteId inválido',
        { athleteId: 'id-invalido' },
        ERROR_CODES.INVALID_OBJECT_ID,
      ],
    ])('rejeita %s', async (_case, query, expectedCode) => {
      const admin = await createUser('admin');

      const response = await request(app)
        .get('/api/v1/links')
        .query(query)
        .set('Authorization', authorization(admin));

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(expectedCode);
    });

    it('bloqueia listagem por profissional ainda não aprovado', async () => {
      const professional = await createUser('professional', {
        verificationStatus: 'pending',
      });

      const response = await request(app)
        .get('/api/v1/links')
        .set('Authorization', authorization(professional));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        ERROR_CODES.PROFESSIONAL_PENDING_APPROVAL,
      );
    });
  });

  describe('GET /api/v1/links/:id', () => {
    it('permite consulta ao admin e aos dois participantes', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);

      for (const requester of [admin, professional, athlete]) {
        const response = await request(app)
          .get(`/api/v1/links/${link.id}`)
          .set('Authorization', authorization(requester));

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(link.id);
        expectSafeLink(response.body.data);
      }
    });

    it('oculta o vínculo de usuário externo', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .get(`/api/v1/links/${link.id}`)
        .set('Authorization', authorization(outsider));

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });

    it('trata recurso inexistente e ObjectId inválido', async () => {
      const admin = await createUser('admin');
      const missing = await request(app)
        .get(`/api/v1/links/${new mongoose.Types.ObjectId()}`)
        .set('Authorization', authorization(admin));
      const invalid = await request(app)
        .get('/api/v1/links/id-invalido')
        .set('Authorization', authorization(admin));

      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
    });
  });

  describe('PATCH /api/v1/links/:id/accept', () => {
    it('permite que o atleta destinatário aceite e gera uma única auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/accept`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: link.id,
        status: 'active',
        rejectedAt: null,
        endedAt: null,
        endedBy: null,
      });
      expect(response.body.data.acceptedAt).toEqual(expect.any(String));
      expectSafeLink(response.body.data);

      const stored = await ProfessionalAthleteLink.findById(link.id);
      expect(stored.status).toBe('active');
      expect(stored.acceptedAt).toBeInstanceOf(Date);
      const audits = await AuditLog.find({
        action: AUDIT_ACTIONS.LINK_ACCEPTED,
        entityId: link.id,
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: athlete._id,
        metadata: { from: 'pending', to: 'active' },
      });
    });

    it.each(['admin', 'professional'])(
      'impede aceite pelo perfil %s',
      async (role) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const requester =
          role === 'professional' ? professional : await createUser('admin');
        const link = await createLink(professional, athlete);

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/accept`)
          .set('Authorization', authorization(requester))
          .send({});

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
      },
    );

    it('oculta a solicitação de outro atleta', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/accept`)
        .set('Authorization', authorization(outsider))
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });

    it.each(['active', 'rejected', 'ended'])(
      'rejeita aceite de vínculo %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const link = await createLink(professional, athlete, status);

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/accept`)
          .set('Authorization', authorization(athlete))
          .send({});

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(ERROR_CODES.LINK_NOT_PENDING);
        expect(
          await AuditLog.countDocuments({
            action: AUDIT_ACTIONS.LINK_ACCEPTED,
          }),
        ).toBe(0);
      },
    );

    it('valida id, existência e payload vazio', async () => {
      const athlete = await createUser('athlete');
      const headers = { Authorization: authorization(athlete) };
      const invalid = await request(app)
        .patch('/api/v1/links/id-invalido/accept')
        .set(headers)
        .send({});
      const missing = await request(app)
        .patch(`/api/v1/links/${new mongoose.Types.ObjectId()}/accept`)
        .set(headers)
        .send({});
      const unknownField = await request(app)
        .patch(`/api/v1/links/${new mongoose.Types.ObjectId()}/accept`)
        .set(headers)
        .send({ status: 'active' });

      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect(unknownField.status).toBe(400);
      expect(unknownField.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('torna concorrentes dois aceites sem duplicar transição ou auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);
      const accept = () =>
        request(app)
          .patch(`/api/v1/links/${link.id}/accept`)
          .set('Authorization', authorization(athlete))
          .send({});

      const responses = await Promise.all([accept(), accept()]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
      expect(
        responses.find(({ status }) => status === 422).body.error.code,
      ).toBe(ERROR_CODES.LINK_NOT_PENDING);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.LINK_ACCEPTED,
          entityId: link.id,
        }),
      ).toBe(1);
    });
  });

  describe('PATCH /api/v1/links/:id/reject', () => {
    it('rejeita com motivo normalizado somente na auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/reject`)
        .set('Authorization', authorization(athlete))
        .send({ reason: '  Solicitação recusada.  ' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('rejected');
      expect(response.body.data.rejectedAt).toEqual(expect.any(String));
      expectSafeLink(response.body.data);

      const stored = await ProfessionalAthleteLink.findById(link.id).lean();
      expect(stored).not.toHaveProperty('rejectionReason');
      expect(stored).not.toHaveProperty('reason');
      const audit = await auditFor(AUDIT_ACTIONS.LINK_REJECTED, link.id);
      expect(audit).toMatchObject({
        actorId: athlete._id,
        metadata: {
          from: 'pending',
          to: 'rejected',
          reason: 'Solicitação recusada.',
        },
      });
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.LINK_REJECTED,
          entityId: link.id,
        }),
      ).toBe(1);
    });

    it('permite rejeição sem motivo e não cria metadata desnecessária', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/reject`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(response.status).toBe(200);
      const audit = await auditFor(AUDIT_ACTIONS.LINK_REJECTED, link.id);
      expect(audit.metadata).toEqual({
        from: 'pending',
        to: 'rejected',
      });
    });

    it.each([
      ['vazio', { reason: '   ' }],
      ['tipo inválido', { reason: 123 }],
      ['acima do limite', { reason: 'x'.repeat(501) }],
      ['campo desconhecido', { reason: 'Recusado.', status: 'rejected' }],
    ])('rejeita motivo %s', async (_case, body) => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete);

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/reject`)
        .set('Authorization', authorization(athlete))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect((await ProfessionalAthleteLink.findById(link.id)).status).toBe(
        'pending',
      );
    });

    it('aplica role e ownership na rejeição', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('athlete');
      const link = await createLink(professional, athlete);
      const forbidden = await request(app)
        .patch(`/api/v1/links/${link.id}/reject`)
        .set('Authorization', authorization(professional))
        .send({});
      const hidden = await request(app)
        .patch(`/api/v1/links/${link.id}/reject`)
        .set('Authorization', authorization(outsider))
        .send({});

      expect(forbidden.status).toBe(403);
      expect(forbidden.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });

    it.each(['active', 'rejected', 'ended'])(
      'rejeita transição a partir de %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const link = await createLink(professional, athlete, status);

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/reject`)
          .set('Authorization', authorization(athlete))
          .send({});

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(ERROR_CODES.LINK_NOT_PENDING);
      },
    );

    it('trata id inválido e recurso inexistente', async () => {
      const athlete = await createUser('athlete');
      const invalid = await request(app)
        .patch('/api/v1/links/id-invalido/reject')
        .set('Authorization', authorization(athlete))
        .send({});
      const missing = await request(app)
        .patch(`/api/v1/links/${new mongoose.Types.ObjectId()}/reject`)
        .set('Authorization', authorization(athlete))
        .send({});

      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });
  });

  describe('PATCH /api/v1/links/:id/end', () => {
    it.each(['professional', 'athlete'])(
      'permite encerramento sem motivo pelo participante %s',
      async (role) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const requester = role === 'professional' ? professional : athlete;
        const link = await createLink(professional, athlete, 'active');

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/end`)
          .set('Authorization', authorization(requester))
          .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('ended');
        expect(response.body.data.endedAt).toEqual(expect.any(String));
        expect(response.body.data.endedBy).toBe(requester.id);
        expectSafeLink(response.body.data);
        expect(await ProfessionalAthleteLink.countDocuments()).toBe(1);

        const audit = await auditFor(AUDIT_ACTIONS.LINK_ENDED, link.id);
        expect(audit).toMatchObject({
          actorId: requester._id,
          metadata: { from: 'active', to: 'ended' },
        });
        expect(audit.metadata).not.toHaveProperty('reason');
      },
    );

    it('exige e normaliza o motivo do encerramento administrativo', async () => {
      const admin = await createUser('admin');
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete, 'active');

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/end`)
        .set('Authorization', authorization(admin))
        .send({ reason: '  Encerramento administrativo justificado.  ' });

      expect(response.status).toBe(200);
      expect(response.body.data.endedBy).toBe(admin.id);
      expectSafeLink(response.body.data);
      const stored = await ProfessionalAthleteLink.findById(link.id).lean();
      expect(stored).not.toHaveProperty('endReason');
      expect(stored).not.toHaveProperty('reason');
      const audit = await auditFor(AUDIT_ACTIONS.LINK_ENDED, link.id);
      expect(audit).toMatchObject({
        actorId: admin._id,
        metadata: {
          from: 'active',
          to: 'ended',
          reason: 'Encerramento administrativo justificado.',
        },
      });
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.LINK_ENDED,
          entityId: link.id,
        }),
      ).toBe(1);
    });

    it.each([{}, { reason: '   ' }])(
      'impede admin de encerrar sem motivo válido',
      async (body) => {
        const admin = await createUser('admin');
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const link = await createLink(professional, athlete, 'active');

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/end`)
          .set('Authorization', authorization(admin))
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
        expect((await ProfessionalAthleteLink.findById(link.id)).status).toBe(
          'active',
        );
      },
    );

    it('oculta o vínculo de participante externo', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const outsider = await createUser('professional');
      const link = await createLink(professional, athlete, 'active');

      const response = await request(app)
        .patch(`/api/v1/links/${link.id}/end`)
        .set('Authorization', authorization(outsider))
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
      expect((await ProfessionalAthleteLink.findById(link.id)).status).toBe(
        'active',
      );
    });

    it.each(['pending', 'rejected', 'ended'])(
      'rejeita encerramento de vínculo %s',
      async (status) => {
        const professional = await createUser('professional');
        const athlete = await createUser('athlete');
        const link = await createLink(professional, athlete, status);

        const response = await request(app)
          .patch(`/api/v1/links/${link.id}/end`)
          .set('Authorization', authorization(professional))
          .send({});

        expect(response.status).toBe(422);
        expect(response.body.error.code).toBe(ERROR_CODES.LINK_NOT_ACTIVE);
        expect(
          await AuditLog.countDocuments({
            action: AUDIT_ACTIONS.LINK_ENDED,
          }),
        ).toBe(0);
      },
    );

    it('trata id inválido e recurso inexistente', async () => {
      const professional = await createUser('professional');
      const invalid = await request(app)
        .patch('/api/v1/links/id-invalido/end')
        .set('Authorization', authorization(professional))
        .send({});
      const missing = await request(app)
        .patch(`/api/v1/links/${new mongoose.Types.ObjectId()}/end`)
        .set('Authorization', authorization(professional))
        .send({});

      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe(ERROR_CODES.INVALID_OBJECT_ID);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    });

    it('torna concorrentes dois encerramentos sem duplicar auditoria', async () => {
      const professional = await createUser('professional');
      const athlete = await createUser('athlete');
      const link = await createLink(professional, athlete, 'active');
      const end = () =>
        request(app)
          .patch(`/api/v1/links/${link.id}/end`)
          .set('Authorization', authorization(professional))
          .send({});

      const responses = await Promise.all([end(), end()]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 422]);
      expect(
        responses.find(({ status }) => status === 422).body.error.code,
      ).toBe(ERROR_CODES.LINK_NOT_ACTIVE);
      expect(
        await AuditLog.countDocuments({
          action: AUDIT_ACTIONS.LINK_ENDED,
          entityId: link.id,
        }),
      ).toBe(1);
    });
  });

  it('não oferece exclusão física de vínculo', async () => {
    const admin = await createUser('admin');
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const link = await createLink(professional, athlete);

    const response = await request(app)
      .delete(`/api/v1/links/${link.id}`)
      .set('Authorization', authorization(admin));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
    expect(await ProfessionalAthleteLink.countDocuments()).toBe(1);
  });
});
