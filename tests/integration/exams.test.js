const bcrypt = require('bcrypt');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

const app = require('../../src/app');
const AUDIT_ACTIONS = require('../../src/constants/audit-actions');
const AuditLog = require('../../src/models/audit-log');
const Exam = require('../../src/models/exam');
const ProfessionalAthleteLink = require('../../src/models/professional-athlete-link');
const ProfessionalProfile = require('../../src/models/professional-profile');
const User = require('../../src/models/user');
const auditService = require('../../src/services/audit-service');
const storage = require('../../src/storage');
const { generateToken } = require('../../src/utils/jwt');

const pdf = Buffer.from('%PDF-1.7\nconteúdo');
let mongoServer;
let passwordHash;

function authorization(user) {
  return `Bearer ${generateToken(user)}`;
}

function binaryParser(response, callback) {
  const chunks = [];
  response.on('data', (chunk) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
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
    title: 'Hemograma',
    examDate: '2026-08-01T12:00:00.000Z',
    results: [{ marker: 'Marcador', value: '10' }],
    ...overrides,
  };
}

async function createExam(athlete, overrides = {}) {
  return Exam.create({
    athleteId: athlete.id,
    professionalId: null,
    title: 'Exame',
    examDate: new Date('2026-08-01T12:00:00.000Z'),
    results: [],
    createdBy: athlete.id,
    ...overrides,
  });
}

async function storeExamDocument(originalName = 'exame clínico.pdf') {
  const storedDocument = await storage.store({
    buffer: pdf,
    mimetype: 'application/pdf',
  });
  return {
    ...storedDocument,
    originalName,
    mimeType: 'application/pdf',
    sizeBytes: pdf.length,
  };
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash('SenhaForte123!', 10);
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 120000);

afterEach(async () => {
  const exams = await Exam.find({}).select('+document.storageKey');
  await Promise.allSettled(
    exams.map((exam) => exam.document?.storageKey)
      .filter(Boolean)
      .map((key) => storage.remove(key)),
  );
  await Promise.all([
    AuditLog.deleteMany({}),
    Exam.deleteMany({}),
    ProfessionalAthleteLink.deleteMany({}),
    ProfessionalProfile.deleteMany({}),
    User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Exams API V1', () => {
  it('atleta cria próprio sem PDF e gera auditoria segura', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .send(payload());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      athleteId: athlete.id,
      professionalId: null,
      createdBy: athlete.id,
      document: null,
    });
    const log = await AuditLog.findOne({ action: AUDIT_ACTIONS.EXAM_CREATED });
    expect(log.metadata).toMatchObject({
      athleteId: athlete.id,
      createdWithDocument: false,
      createdByRole: 'athlete',
    });
    expect(JSON.stringify(log)).not.toMatch(/results|notes|storageKey|buffer/i);
  });

  it('rejeita athleteId do atleta e campos desconhecidos', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .send(payload({ athleteId: new mongoose.Types.ObjectId().toString() }));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await Exam.countDocuments()).toBe(0);
  });

  it('profissional approved com link active cria e IDs vêm do JWT', async () => {
    const [professional, athlete] = await Promise.all([
      createUser('professional'),
      createUser('athlete'),
    ]);
    await createLink(professional, athlete);
    const response = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(professional))
      .send(payload({ athleteId: athlete.id }));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      athleteId: athlete.id,
      professionalId: professional.id,
      createdBy: professional.id,
    });
  });

  it.each(['pending', 'rejected'])(
    'profissional %s não cria',
    async (status) => {
      const professional = await createUser('professional', status);
      const athlete = await createUser('athlete');
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', authorization(professional))
        .send(payload({ athleteId: athlete.id }));
      expect(response.status).toBe(403);
      expect(await Exam.countDocuments()).toBe(0);
    },
  );

  it('vínculo não ativo ou inexistente não concede criação', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(professional))
      .send(payload({ athleteId: athlete.id }));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ATHLETE_LINK_REQUIRED');
  });

  it('aceita PDF seguro e omite dados internos', async () => {
    const athlete = await createUser('athlete');
    const response = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .field('title', 'Exame com PDF')
      .field('examDate', '2026-08-01T12:00:00.000Z')
      .field('results', JSON.stringify([{ marker: 'M', value: '1' }]))
      .attach('document', pdf, {
        filename: '../../exame.pdf',
        contentType: 'application/pdf',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.document).toEqual({
      originalName: 'exame.pdf',
      mimeType: 'application/pdf',
      sizeBytes: pdf.length,
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /storageKey|private-files|buffer|uuid/i,
    );
  });

  it('rejeita JSON de results inválido e assinatura após prefixo', async () => {
    const athlete = await createUser('athlete');
    const invalidResults = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .field('title', 'Exame')
      .field('examDate', '2026-08-01T12:00:00.000Z')
      .field('results', '[inválido')
      .attach('document', pdf, {
        filename: 'exame.pdf',
        contentType: 'application/pdf',
      });
    expect(invalidResults.status).toBe(400);
    expect(invalidResults.body.error.code).toBe('VALIDATION_ERROR');

    const prefixed = await request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .field('title', 'Exame')
      .field('examDate', '2026-08-01T12:00:00.000Z')
      .attach('document', Buffer.from('MZ%PDF-1.7'), {
        filename: 'exame.pdf',
        contentType: 'application/pdf',
      });
    expect(prefixed.status).toBe(400);
    expect(prefixed.body.error.code).toBe('INVALID_UPLOAD_TYPE');
    expect(await Exam.countDocuments()).toBe(0);
  });

  it('rejeita MIME, extensão, tamanho, field inesperado e results repetido', async () => {
    const athlete = await createUser('athlete');
    const base = () => request(app)
      .post('/api/v1/exams')
      .set('Authorization', authorization(athlete))
      .field('title', 'Exame')
      .field('examDate', '2026-08-01T12:00:00.000Z');

    const mime = await base().attach('document', pdf, {
      filename: 'exame.pdf',
      contentType: 'text/plain',
    });
    const extension = await base().attach('document', pdf, {
      filename: 'exame.txt',
      contentType: 'application/pdf',
    });
    const oversized = await base().attach(
      'document',
      Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1020)]),
      { filename: 'exame.pdf', contentType: 'application/pdf' },
    );
    const field = await base().attach('arquivo', pdf, {
      filename: 'exame.pdf',
      contentType: 'application/pdf',
    });
    const repeated = await base()
      .field('results', '[]')
      .field('results', '[]');

    expect(mime.body.error.code).toBe('INVALID_UPLOAD_TYPE');
    expect(extension.body.error.code).toBe('INVALID_UPLOAD_TYPE');
    expect(oversized.body.error.code).toBe('UPLOAD_TOO_LARGE');
    expect(field.body.error.code).toBe('INVALID_UPLOAD_TYPE');
    expect(repeated.body.error.code).toBe('VALIDATION_ERROR');
    expect(await Exam.countDocuments()).toBe(0);
  });

  it('rejeita results excessivos, propriedades e estruturas inválidas', async () => {
    const athlete = await createUser('athlete');
    const invalidPayloads = [
      payload({ results: Array.from({ length: 101 }, () => ({ marker: 'M', value: '1' })) }),
      payload({ results: [{ marker: 'M', value: '1', extra: 'x' }] }),
      payload({ results: [{ marker: 'M', value: { nested: true } }] }),
      payload({ results: [{ marker: 'M', value: ['1'] }] }),
    ];
    for (const body of invalidPayloads) {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', authorization(athlete))
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await Exam.countDocuments()).toBe(0);
  });

  it('falha de storage não cria Exam nem auditoria', async () => {
    const athlete = await createUser('athlete');
    const store = jest.spyOn(storage, 'store').mockRejectedValueOnce(new Error('storage'));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', authorization(athlete))
        .field('title', 'Exame')
        .field('examDate', '2026-08-01T12:00:00.000Z')
        .attach('document', pdf, {
          filename: 'exame.pdf',
          contentType: 'application/pdf',
        });
      expect(response.status).toBe(500);
      expect(await Exam.countDocuments()).toBe(0);
      expect(await AuditLog.countDocuments()).toBe(0);
    } finally {
      store.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('faz rollback do arquivo quando persistência falha', async () => {
    const athlete = await createUser('athlete');
    const create = jest.spyOn(Exam, 'create').mockRejectedValueOnce(new Error('falha'));
    const remove = jest.spyOn(storage, 'remove');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', authorization(athlete))
        .field('title', 'Exame')
        .field('examDate', '2026-08-01T12:00:00.000Z')
        .attach('document', pdf, {
          filename: 'exame.pdf',
          contentType: 'application/pdf',
        });
      expect(response.status).toBe(500);
      expect(remove).toHaveBeenCalledTimes(1);
      expect(await Exam.countDocuments()).toBe(0);
    } finally {
      create.mockRestore();
      remove.mockRestore();
      consoleError.mockRestore();
    }
  });

  it('faz rollback do Exam e arquivo quando auditoria falha', async () => {
    const athlete = await createUser('athlete');
    const record = jest.spyOn(auditService, 'record')
      .mockRejectedValueOnce(new Error('auditoria'));
    const remove = jest.spyOn(storage, 'remove');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app)
        .post('/api/v1/exams')
        .set('Authorization', authorization(athlete))
        .field('title', 'Exame')
        .field('examDate', '2026-08-01T12:00:00.000Z')
        .attach('document', pdf, {
          filename: 'exame.pdf',
          contentType: 'application/pdf',
        });
      expect(response.status).toBe(500);
      expect(await Exam.countDocuments()).toBe(0);
      expect(remove).toHaveBeenCalledTimes(1);
    } finally {
      record.mockRestore();
      remove.mockRestore();
      consoleError.mockRestore();
    }
  });

  describe('GET /api/v1/exams/:id/document', () => {
    it('retorna o PDF ao próprio atleta e ao profissional aprovado vinculado', async () => {
      const athlete = await createUser('athlete');
      const professional = await createUser('professional');
      await createLink(professional, athlete);
      const exam = await createExam(athlete, {
        document: await storeExamDocument(),
      });

      const athleteResponse = await request(app)
        .get(`/api/v1/exams/${exam.id}/document`)
        .set('Authorization', authorization(athlete))
        .buffer(true)
        .parse(binaryParser);
      const professionalResponse = await request(app)
        .get(`/api/v1/exams/${exam.id}/document`)
        .set('Authorization', authorization(professional))
        .buffer(true)
        .parse(binaryParser);

      for (const response of [athleteResponse, professionalResponse]) {
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['content-disposition']).toContain(
          "filename*=UTF-8''exame%20cl%C3%ADnico.pdf",
        );
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.body).toEqual(pdf);
      }
    });

    it('não permite acesso de terceiros e exige autenticação', async () => {
      const athlete = await createUser('athlete');
      const otherAthlete = await createUser('athlete');
      const unlinkedProfessional = await createUser('professional');
      const exam = await createExam(athlete, {
        document: await storeExamDocument(),
      });

      const unauthenticated = await request(app).get(
        `/api/v1/exams/${exam.id}/document`,
      );
      const athleteResponse = await request(app)
        .get(`/api/v1/exams/${exam.id}/document`)
        .set('Authorization', authorization(otherAthlete));
      const professionalResponse = await request(app)
        .get(`/api/v1/exams/${exam.id}/document`)
        .set('Authorization', authorization(unlinkedProfessional));

      expect(unauthenticated.status).toBe(401);
      expect(unauthenticated.body.error.code).toBe('AUTH_REQUIRED');
      expect(athleteResponse.status).toBe(404);
      expect(athleteResponse.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(professionalResponse.status).toBe(404);
      expect(professionalResponse.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('retorna 404 para entidade, documento ou arquivo inexistente', async () => {
      const athlete = await createUser('athlete');
      const withoutDocument = await createExam(athlete);
      const missingFile = await createExam(athlete, {
        document: {
          storageKey: `${crypto.randomUUID()}.pdf`,
          url: null,
          originalName: 'ausente.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        },
      });

      const calls = [
        request(app).get(
          `/api/v1/exams/${new mongoose.Types.ObjectId()}/document`,
        ),
        request(app).get(`/api/v1/exams/${withoutDocument.id}/document`),
        request(app).get(`/api/v1/exams/${missingFile.id}/document`),
      ];
      const responses = await Promise.all(
        calls.map((call) =>
          call.set('Authorization', authorization(athlete))),
      );

      expect(responses.map((response) => response.status)).toEqual([
        404, 404, 404,
      ]);
      responses.forEach((response) =>
        expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND'));
    });
  });

  it('admin recebe FORBIDDEN em todos os endpoints', async () => {
    const admin = await createUser('admin');
    const id = new mongoose.Types.ObjectId();
    const calls = [
      request(app).get('/api/v1/exams'),
      request(app).get(`/api/v1/exams/${id}`),
      request(app).get(`/api/v1/exams/${id}/document`),
      request(app).post('/api/v1/exams').send(payload()),
      request(app).patch(`/api/v1/exams/${id}`).send({ title: 'X' }),
      request(app).patch(`/api/v1/exams/${id}/archive`).send({}),
    ];
    const responses = await Promise.all(
      calls.map((call) => call.set('Authorization', authorization(admin))),
    );
    expect(responses.map((response) => response.status)).toEqual(
      [403, 403, 403, 403, 403, 403],
    );
    responses.forEach((response) =>
      expect(response.body.error.code).toBe('FORBIDDEN'));
  });

  it('listagem respeita ownership, archived, datas e ordenação', async () => {
    const athlete = await createUser('athlete');
    const outsider = await createUser('athlete');
    await createExam(athlete, { title: 'B', examDate: new Date('2026-08-02') });
    await createExam(athlete, {
      title: 'A',
      examDate: new Date('2026-08-01'),
      archivedAt: new Date(),
    });
    await createExam(outsider);

    const active = await request(app)
      .get('/api/v1/exams?sortBy=examDate&sortOrder=desc')
      .set('Authorization', authorization(athlete));
    expect(active.status).toBe(200);
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0].title).toBe('B');

    const archived = await request(app)
      .get('/api/v1/exams?archived=true')
      .set('Authorization', authorization(athlete));
    expect(archived.body.data).toHaveLength(1);
    expect(archived.body.data[0].title).toBe('A');

    const invalid = await request(app)
      .get('/api/v1/exams?sortBy=title')
      .set('Authorization', authorization(athlete));
    expect(invalid.status).toBe(400);
  });

  it('professional consulta exame do atleta, mas não assume autoria', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    await createLink(professional, athlete);
    const exam = await createExam(athlete);

    const detail = await request(app)
      .get(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(professional));
    expect(detail.status).toBe(200);

    const update = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(professional))
      .send({ title: 'Assumido' });
    expect(update.status).toBe(404);
  });

  it('vínculo encerrado remove acesso profissional e detalhe usa 404 seguro', async () => {
    const professional = await createUser('professional');
    const athlete = await createUser('athlete');
    const link = await createLink(professional, athlete);
    const exam = await createExam(athlete, {
      professionalId: professional.id,
      createdBy: professional.id,
    });
    link.status = 'ended';
    link.endedAt = new Date();
    link.endedBy = professional.id;
    await link.save();

    const response = await request(app)
      .get(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(professional));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('valida ObjectId e bloqueia atualização de exame arquivado', async () => {
    const athlete = await createUser('athlete');
    const invalidId = await request(app)
      .get('/api/v1/exams/id-invalido')
      .set('Authorization', authorization(athlete));
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('INVALID_OBJECT_ID');

    const exam = await createExam(athlete, { archivedAt: new Date() });
    const update = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(athlete))
      .send({ title: 'Novo' });
    expect(update.status).toBe(422);
    expect(update.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('PATCH aceita apenas JSON/campos permitidos e preserva PDF', async () => {
    const athlete = await createUser('athlete');
    const exam = await createExam(athlete, {
      document: {
        storageKey: new mongoose.Types.ObjectId().toString().padEnd(36, 'a') + '.pdf',
        url: null,
        originalName: 'original.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
      },
    });
    for (const forbiddenBody of [
      { storageKey: 'x' },
      { url: '/private-files/x' },
      { document: null },
    ]) {
      const invalid = await request(app)
        .patch(`/api/v1/exams/${exam.id}`)
        .set('Authorization', authorization(athlete))
        .send(forbiddenBody);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    }

    const multipart = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(athlete))
      .field('title', 'Novo');
    expect(multipart.status).toBe(400);

    const valid = await request(app)
      .patch(`/api/v1/exams/${exam.id}`)
      .set('Authorization', authorization(athlete))
      .send({ title: 'Novo' });
    expect(valid.status).toBe(200);
    expect(valid.body.data.document.originalName).toBe('original.pdf');
  });

  it('archive é idempotente e concorrente gera uma auditoria', async () => {
    const athlete = await createUser('athlete');
    const exam = await createExam(athlete);
    const call = () => request(app)
      .patch(`/api/v1/exams/${exam.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({});
    const [first, second] = await Promise.all([call(), call()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.archivedAt).toBe(second.body.data.archivedAt);
    expect(await AuditLog.countDocuments({
      action: AUDIT_ACTIONS.EXAM_ARCHIVED,
      entityId: exam._id,
    })).toBe(1);

    const extra = await request(app)
      .patch(`/api/v1/exams/${exam.id}/archive`)
      .set('Authorization', authorization(athlete))
      .send({ reason: 'não permitido' });
    expect(extra.status).toBe(400);
  });
});
