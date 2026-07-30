const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const connectDatabase = require('../src/config/database');
const env = require('../src/config/env');

const AuditLog = require('../src/models/audit-log');
const CheckIn = require('../src/models/check-in');
const Notification = require('../src/models/notification');
const ProfessionalAthleteLink = require(
  '../src/models/professional-athlete-link',
);
const ProfessionalProfile = require('../src/models/professional-profile');
const Protocol = require('../src/models/protocol');
const ProtocolVersion = require('../src/models/protocol-version');
const Substance = require('../src/models/substance');
const TrackingRecord = require('../src/models/tracking-record');
const User = require('../src/models/user');

const AUDIT_ACTIONS = require('../src/constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../src/constants/audit-entity-types');
const CHECK_IN_STATUSES = require('../src/constants/check-in-statuses');
const LINK_STATUSES = require('../src/constants/link-statuses');
const NOTIFICATION_ENTITY_TYPES = require(
  '../src/constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../src/constants/notification-types');
const PROFESSIONAL_VERIFICATION_STATUSES = require(
  '../src/constants/professional-verification-statuses',
);
const PROTOCOL_FREQUENCY_TYPES = require(
  '../src/constants/protocol-frequency-types',
);
const PROTOCOL_STATUSES = require('../src/constants/protocol-statuses');
const SUBSTANCE_CATEGORIES = require(
  '../src/constants/substance-categories',
);
const TRACKING_RECORD_STATUSES = require(
  '../src/constants/tracking-record-statuses',
);
const TRACKING_RECORD_TYPES = require(
  '../src/constants/tracking-record-types',
);
const USER_ROLES = require('../src/constants/user-roles');

const {
  normalizeSubstanceName,
} = require('../src/utils/normalize-substance-name');
const {
  normalizeReferenceWeek,
} = require('../src/utils/normalize-reference-week');

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const HOUR_IN_MS = 60 * 60 * 1000;

const DEMO_EMAILS = Object.freeze({
  admin: 'admin@atlas.demo',
  athlete: 'atleta@atlas.demo',
  professional: 'profissional@atlas.demo',
  pendingProfessional: 'pendente@atlas.demo',
});

const DEMO_SUBSTANCE_NAMES = Object.freeze([
  '[DEMO] Hidratação diária',
  '[DEMO] Sessão de mobilidade',
]);

function addDays(date, amount) {
  return new Date(date.getTime() + amount * DAY_IN_MS);
}

function addHours(date, amount) {
  return new Date(date.getTime() + amount * HOUR_IN_MS);
}

function validateSeedConfiguration() {
  if (process.env.SEED_DEMO_CONFIRM !== 'ATLAS_DEMO') {
    throw new Error(
      'Defina SEED_DEMO_CONFIRM=ATLAS_DEMO para confirmar a execução.',
    );
  }

  const password = process.env.DEMO_SEED_PASSWORD;

  if (!password || password.length < 12 || password.length > 72) {
    throw new Error(
      'DEMO_SEED_PASSWORD deve possuir entre 12 e 72 caracteres.',
    );
  }

  return password;
}

async function upsertUser({
  email,
  name,
  passwordHash,
  role,
}) {
  return User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        passwordHash,
        role,
        active: true,
        blockedAt: null,
        lastLoginAt: null,
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );
}

async function cleanPreviousDemoData(users) {
  const demoUserIds = users.map((user) => user._id);

  const existingProtocols = await Protocol.find({
    $or: [
      { athleteId: { $in: demoUserIds } },
      { professionalId: { $in: demoUserIds } },
    ],
  }).select('_id');

  const protocolIds = existingProtocols.map((protocol) => protocol._id);

  await Promise.all([
    ProtocolVersion.deleteMany({
      protocolId: { $in: protocolIds },
    }),

    TrackingRecord.deleteMany({
      $or: [
        { athleteId: { $in: demoUserIds } },
        { professionalId: { $in: demoUserIds } },
        { createdBy: { $in: demoUserIds } },
      ],
    }),

    CheckIn.deleteMany({
      $or: [
        { athleteId: { $in: demoUserIds } },
        { professionalId: { $in: demoUserIds } },
      ],
    }),

    Notification.deleteMany({
      userId: { $in: demoUserIds },
    }),

    AuditLog.deleteMany({
      actorId: { $in: demoUserIds },
    }),

    ProfessionalAthleteLink.deleteMany({
      $or: [
        { professionalId: { $in: demoUserIds } },
        { athleteId: { $in: demoUserIds } },
      ],
    }),

    ProfessionalProfile.deleteMany({
      userId: { $in: demoUserIds },
    }),

    Substance.deleteMany({
      normalizedName: {
        $in: DEMO_SUBSTANCE_NAMES.map(normalizeSubstanceName),
      },
    }),
  ]);

  await Protocol.deleteMany({
    _id: { $in: protocolIds },
  });
}

function verificationDocument(number) {
  const storageKey =
    `00000000-0000-4000-8000-${String(number).padStart(12, '0')}.pdf`;

  return {
    storageKey,
    url: `/private-files/${storageKey}`,
    originalName: 'documento-demonstracao.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  };
}

async function createProfessionalProfiles({
  admin,
  professional,
  pendingProfessional,
  now,
}) {
  const approvedProfile = await ProfessionalProfile.create({
    userId: professional._id,
    verificationStatus:
      PROFESSIONAL_VERIFICATION_STATUSES.APPROVED,
    verificationDocument: verificationDocument(1),
    submittedAt: addDays(now, -30),
    reviewedAt: addDays(now, -29),
    reviewedBy: admin._id,
    rejectionReason: null,
  });

  const pendingProfile = await ProfessionalProfile.create({
    userId: pendingProfessional._id,
    verificationStatus:
      PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
    verificationDocument: verificationDocument(2),
    submittedAt: addDays(now, -2),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  });

  return {
    approvedProfile,
    pendingProfile,
  };
}

async function createDemoLink({
  athlete,
  professional,
  now,
}) {
  return ProfessionalAthleteLink.create({
    professionalId: professional._id,
    athleteId: athlete._id,
    status: LINK_STATUSES.ACTIVE,
    requestedAt: addDays(now, -20),
    acceptedAt: addDays(now, -19),
    rejectedAt: null,
    endedAt: null,
    endedBy: null,
  });
}

async function createDemoSubstances(admin) {
  const substances = await Substance.create([
    {
      name: DEMO_SUBSTANCE_NAMES[0],
      description:
        'Item fictício utilizado somente na demonstração do sistema.',
      category: SUBSTANCE_CATEGORIES.OTHER,
      defaultUnit: null,
      active: true,
      createdBy: admin._id,
    },
    {
      name: DEMO_SUBSTANCE_NAMES[1],
      description:
        'Atividade fictícia utilizada somente na demonstração.',
      category: SUBSTANCE_CATEGORIES.OTHER,
      defaultUnit: null,
      active: true,
      createdBy: admin._id,
    },
  ]);

  return {
    hydration: substances[0],
    mobility: substances[1],
  };
}

async function createDemoProtocol({
  athlete,
  professional,
  hydration,
  mobility,
  now,
}) {
  const draftAt = addDays(now, -14);
  const activatedAt = addDays(now, -13);

  const protocol = await Protocol.create({
    athleteId: athlete._id,
    professionalId: professional._id,
    title: 'Plano de acompanhamento demonstrativo',
    objective:
      'Organizar uma rotina fictícia de acompanhamento para a apresentação.',
    status: PROTOCOL_STATUSES.ACTIVE,
    currentVersion: 1,
    startDate: draftAt,
    endDate: null,
    continuous: true,
    activatedAt,
    pausedAt: null,
    closedAt: null,
    cancelledAt: null,
    statusHistory: [
      {
        from: null,
        to: PROTOCOL_STATUSES.DRAFT,
        reason: null,
        changedAt: draftAt,
        changedBy: professional._id,
      },
      {
        from: PROTOCOL_STATUSES.DRAFT,
        to: PROTOCOL_STATUSES.ACTIVE,
        reason: 'Protocolo preparado para a demonstração.',
        changedAt: activatedAt,
        changedBy: professional._id,
      },
    ],
  });

  const version = await ProtocolVersion.create({
    protocolId: protocol._id,
    version: 1,
    createdBy: professional._id,
    changeReason: 'Versão inicial demonstrativa.',
    startDate: draftAt,
    endDate: null,
    continuous: true,
    items: [
      {
        substanceId: hydration._id,
        substanceSnapshot: {
          name: hydration.name,
          category: hydration.category,
        },
        instructions:
          'Registrar o acompanhamento da rotina durante o dia.',
        frequencyType: PROTOCOL_FREQUENCY_TYPES.DAILY,
        weekDays: [],
        time: '08:00',
        startDate: draftAt,
        endDate: null,
        active: true,
      },
      {
        substanceId: mobility._id,
        substanceSnapshot: {
          name: mobility.name,
          category: mobility.category,
        },
        instructions:
          'Registrar uma sessão demonstrativa três vezes por semana.',
        frequencyType: PROTOCOL_FREQUENCY_TYPES.WEEKLY,
        weekDays: [1, 3, 5],
        time: '18:00',
        startDate: draftAt,
        endDate: null,
        active: true,
      },
    ],
  });

  return {
    protocol,
    version,
    draftAt,
    activatedAt,
  };
}

async function createDemoTrackings({
  athlete,
  professional,
  protocol,
  now,
}) {
  const completedTracking = await TrackingRecord.create({
    athleteId: athlete._id,
    professionalId: professional._id,
    protocolId: protocol._id,
    protocolVersion: 1,
    type: TRACKING_RECORD_TYPES.SCHEDULED,
    title: 'Acompanhamento diário concluído',
    scheduledFor: addDays(now, -1),
    status: TRACKING_RECORD_STATUSES.COMPLETED,
    statusReason: null,
    completedAt: addHours(addDays(now, -1), 1),
    completedBy: athlete._id,
    notes:
      'Registro demonstrativo concluído pelo atleta.',
    createdBy: professional._id,
  });

  const upcomingTracking = await TrackingRecord.create({
    athleteId: athlete._id,
    professionalId: professional._id,
    protocolId: protocol._id,
    protocolVersion: 1,
    type: TRACKING_RECORD_TYPES.SCHEDULED,
    title: 'Próximo acompanhamento da rotina',
    scheduledFor: addDays(now, 1),
    status: TRACKING_RECORD_STATUSES.SCHEDULED,
    statusReason: null,
    completedAt: null,
    completedBy: null,
    notes: null,
    createdBy: professional._id,
  });

  return {
    completedTracking,
    upcomingTracking,
  };
}

async function createDemoCheckIns({
  athlete,
  professional,
  protocol,
  now,
}) {
  const currentWeek = normalizeReferenceWeek(now);
  const previousWeek = normalizeReferenceWeek(
    addDays(now, -7),
  );

  const reviewedCheckIn = await CheckIn.create({
    athleteId: athlete._id,
    professionalId: professional._id,
    protocolId: protocol._id,
    referenceWeek: previousWeek,
    status: CHECK_IN_STATUSES.REVIEWED,
    responses: {
      rotina: 'A rotina foi acompanhada durante a semana.',
      atividadesConcluidas: true,
      dificuldade: 'Nenhuma dificuldade relevante.',
      avaliacao: 9,
    },
    submittedAt: addDays(now, -8),
    reviewedAt: addDays(now, -7),
    reviewedBy: professional._id,
    reviewComment:
      'Check-in revisado. Manter os registros na próxima semana.',
  });

  const submittedCheckIn = await CheckIn.create({
    athleteId: athlete._id,
    professionalId: professional._id,
    protocolId: protocol._id,
    referenceWeek: currentWeek,
    status: CHECK_IN_STATUSES.SUBMITTED,
    responses: {
      rotina: 'A rotina foi acompanhada parcialmente.',
      atividadesConcluidas: true,
      dificuldade:
        'Foi necessário reorganizar os horários.',
      avaliacao: 8,
    },
    submittedAt: addHours(now, -2),
    reviewedAt: null,
    reviewedBy: null,
    reviewComment: null,
  });

  return {
    reviewedCheckIn,
    submittedCheckIn,
  };
}

async function createDemoNotifications({
  athlete,
  professional,
  approvedProfile,
  protocol,
  reviewedCheckIn,
  submittedCheckIn,
}) {
  await Notification.create([
    {
      userId: professional._id,
      type: NOTIFICATION_TYPES.PROFESSIONAL_APPROVED,
      title: 'Cadastro profissional aprovado',
      message:
        'Seu cadastro profissional demonstrativo foi aprovado.',
      entityType:
        NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_PROFILE,
      entityId: approvedProfile._id,
      readAt: new Date(),
      archivedAt: null,
    },
    {
      userId: athlete._id,
      type: NOTIFICATION_TYPES.PROTOCOL_STATUS_CHANGED,
      title: 'Protocolo ativo',
      message:
        'Seu protocolo demonstrativo está ativo.',
      entityType: NOTIFICATION_ENTITY_TYPES.PROTOCOL,
      entityId: protocol._id,
      readAt: null,
      archivedAt: null,
    },
    {
      userId: athlete._id,
      type: NOTIFICATION_TYPES.CHECKIN_REVIEWED,
      title: 'Check-in revisado',
      message:
        'O check-in da semana anterior foi revisado.',
      entityType: NOTIFICATION_ENTITY_TYPES.CHECK_IN,
      entityId: reviewedCheckIn._id,
      readAt: null,
      archivedAt: null,
    },
    {
      userId: professional._id,
      type: NOTIFICATION_TYPES.CHECKIN_SUBMITTED,
      title: 'Novo check-in enviado',
      message:
        'O atleta enviou um check-in para revisão.',
      entityType: NOTIFICATION_ENTITY_TYPES.CHECK_IN,
      entityId: submittedCheckIn._id,
      readAt: null,
      archivedAt: null,
    },
  ]);
}

async function createDemoAuditLogs({
  admin,
  athlete,
  professional,
  approvedProfile,
  link,
  protocol,
  submittedCheckIn,
  reviewedCheckIn,
  now,
}) {
  await AuditLog.create([
    {
      actorId: admin._id,
      action: AUDIT_ACTIONS.PROFESSIONAL_APPROVED,
      entityType:
        AUDIT_ENTITY_TYPES.PROFESSIONAL_PROFILE,
      entityId: approvedProfile._id,
      metadata: {
        demonstration: true,
      },
      createdAt: addDays(now, -29),
    },
    {
      actorId: athlete._id,
      action: AUDIT_ACTIONS.LINK_ACCEPTED,
      entityType:
        AUDIT_ENTITY_TYPES.PROFESSIONAL_ATHLETE_LINK,
      entityId: link._id,
      metadata: {
        demonstration: true,
      },
      createdAt: addDays(now, -19),
    },
    {
      actorId: professional._id,
      action: AUDIT_ACTIONS.PROTOCOL_CREATED,
      entityType: AUDIT_ENTITY_TYPES.PROTOCOL,
      entityId: protocol._id,
      metadata: {
        demonstration: true,
        version: 1,
      },
      createdAt: addDays(now, -14),
    },
    {
      actorId: athlete._id,
      action: AUDIT_ACTIONS.CHECKIN_SUBMITTED,
      entityType: AUDIT_ENTITY_TYPES.CHECK_IN,
      entityId: submittedCheckIn._id,
      metadata: {
        demonstration: true,
      },
      createdAt: addHours(now, -2),
    },
    {
      actorId: professional._id,
      action: AUDIT_ACTIONS.CHECKIN_REVIEWED,
      entityType: AUDIT_ENTITY_TYPES.CHECK_IN,
      entityId: reviewedCheckIn._id,
      metadata: {
        demonstration: true,
      },
      createdAt: addHours(now, -1),
    },
  ]);
}

async function seedDemo() {
  const password = validateSeedConfiguration();
  const passwordHash = await bcrypt.hash(
    password,
    env.bcryptSaltRounds,
  );

  const now = new Date();

  await connectDatabase(env.mongodbUri);

  const admin = await upsertUser({
    name: 'Administrador Atlas',
    email: DEMO_EMAILS.admin,
    passwordHash,
    role: USER_ROLES.ADMIN,
  });

  const athlete = await upsertUser({
    name: 'Rafael Atleta Demo',
    email: DEMO_EMAILS.athlete,
    passwordHash,
    role: USER_ROLES.ATHLETE,
  });

  const professional = await upsertUser({
    name: 'Profissional Atlas Demo',
    email: DEMO_EMAILS.professional,
    passwordHash,
    role: USER_ROLES.PROFESSIONAL,
  });

  const pendingProfessional = await upsertUser({
    name: 'Profissional Pendente Demo',
    email: DEMO_EMAILS.pendingProfessional,
    passwordHash,
    role: USER_ROLES.PROFESSIONAL,
  });

  await cleanPreviousDemoData([
    admin,
    athlete,
    professional,
    pendingProfessional,
  ]);

  const {
    approvedProfile,
  } = await createProfessionalProfiles({
    admin,
    professional,
    pendingProfessional,
    now,
  });

  const link = await createDemoLink({
    athlete,
    professional,
    now,
  });

  const {
    hydration,
    mobility,
  } = await createDemoSubstances(admin);

  const {
    protocol,
  } = await createDemoProtocol({
    athlete,
    professional,
    hydration,
    mobility,
    now,
  });

  await createDemoTrackings({
    athlete,
    professional,
    protocol,
    now,
  });

  const {
    reviewedCheckIn,
    submittedCheckIn,
  } = await createDemoCheckIns({
    athlete,
    professional,
    protocol,
    now,
  });

  await createDemoNotifications({
    athlete,
    professional,
    approvedProfile,
    protocol,
    reviewedCheckIn,
    submittedCheckIn,
  });

  await createDemoAuditLogs({
    admin,
    athlete,
    professional,
    approvedProfile,
    link,
    protocol,
    submittedCheckIn,
    reviewedCheckIn,
    now,
  });

  console.info('');
  console.info('Seed de demonstração concluída.');
  console.info('');
  console.info(`Admin: ${DEMO_EMAILS.admin}`);
  console.info(`Atleta: ${DEMO_EMAILS.athlete}`);
  console.info(
    `Profissional aprovado: ${DEMO_EMAILS.professional}`,
  );
  console.info(
    `Profissional pendente: ${DEMO_EMAILS.pendingProfessional}`,
  );
  console.info(
    'Senha: valor definido em DEMO_SEED_PASSWORD.',
  );
}

seedDemo()
  .catch((error) => {
    console.error('Falha ao executar a seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });