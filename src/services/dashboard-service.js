const CHECK_IN_STATUSES = require('../constants/check-in-statuses');
const ERROR_CODES = require('../constants/error-codes');
const LINK_STATUSES = require('../constants/link-statuses');
const PROFESSIONAL_VERIFICATION_STATUSES = require(
  '../constants/professional-verification-statuses',
);
const PROTOCOL_STATUSES = require('../constants/protocol-statuses');
const TRACKING_RECORD_STATUSES = require(
  '../constants/tracking-record-statuses',
);
const USER_ROLES = require('../constants/user-roles');
const AuditLog = require('../models/audit-log');
const CheckIn = require('../models/check-in');
const ProfessionalAthleteLink = require('../models/professional-athlete-link');
const ProfessionalProfile = require('../models/professional-profile');
const Protocol = require('../models/protocol');
const TrackingRecord = require('../models/tracking-record');
const User = require('../models/user');
const AppError = require('../utils/app-error');
const {
  toActiveProtocol,
  toActivityItem,
  toCurrentCheckIn,
  toNextTracking,
  toRecentAudit,
  toUpcomingTracking,
} = require('../utils/dashboard-response');
const { normalizeReferenceWeek } = require(
  '../utils/normalize-reference-week',
);

const DASHBOARD_LIST_LIMIT = 10;

const ACTIVITY_CONFIG = Object.freeze([
  {
    model: Protocol,
    type: 'protocol',
    title: 'Protocolo atualizado',
    occurredAt: '$updatedAt',
  },
  {
    model: TrackingRecord,
    type: 'tracking',
    title: 'Acompanhamento atualizado',
    occurredAt: { $ifNull: ['$completedAt', '$updatedAt'] },
  },
  {
    model: CheckIn,
    type: 'check_in',
    title: 'Check-in atualizado',
    occurredAt: {
      $ifNull: [
        '$reviewedAt',
        { $ifNull: ['$submittedAt', '$createdAt'] },
      ],
    },
  },
]);

function forbiddenError(message = 'Perfil sem acesso ao dashboard.') {
  return new AppError(403, ERROR_CODES.FORBIDDEN, message);
}

function compareRecentActivity(left, right) {
  const dateDifference =
    new Date(right.occurredAt).getTime() -
    new Date(left.occurredAt).getTime();
  if (dateDifference !== 0) return dateDifference;

  return right.entityId.localeCompare(left.entityId);
}

async function findActivity(modelConfig, filters) {
  return modelConfig.model.aggregate([
    { $match: filters },
    {
      $project: {
        athleteId: 1,
        status: 1,
        occurredAt: modelConfig.occurredAt,
      },
    },
    { $sort: { occurredAt: -1, _id: -1 } },
    { $limit: DASHBOARD_LIST_LIMIT },
  ]);
}

async function getRecentActivity(filters, includeAthleteId = false) {
  const results = await Promise.all(
    ACTIVITY_CONFIG.map(async (config) => {
      const records = await findActivity(config, filters);
      return records.map((record) =>
        toActivityItem(
          {
            ...record,
            type: config.type,
            title: config.title,
          },
          includeAthleteId,
        ),
      );
    }),
  );

  return results
    .flat()
    .sort(compareRecentActivity)
    .slice(0, DASHBOARD_LIST_LIMIT);
}

async function getAthleteDashboard(requester, now) {
  const referenceWeek = normalizeReferenceWeek(now);
  const [
    activeProtocol,
    nextTracking,
    currentCheckIn,
    recentActivity,
  ] = await Promise.all([
    Protocol.findOne({
      athleteId: requester.id,
      status: PROTOCOL_STATUSES.ACTIVE,
    })
      .select(
        '_id title status professionalId currentVersion startDate endDate continuous activatedAt createdAt',
      )
      .sort({ activatedAt: -1, createdAt: -1, _id: -1 })
      .lean(),
    TrackingRecord.findOne({
      athleteId: requester.id,
      status: TRACKING_RECORD_STATUSES.SCHEDULED,
      scheduledFor: { $gte: now },
    })
      .select(
        '_id title type scheduledFor status protocolId professionalId createdAt',
      )
      .sort({ scheduledFor: 1, createdAt: 1, _id: 1 })
      .lean(),
    CheckIn.findOne({
      athleteId: requester.id,
      referenceWeek,
    })
      .select(
        '_id professionalId protocolId referenceWeek status submittedAt reviewedAt',
      )
      .lean(),
    getRecentActivity({ athleteId: requester._id }),
  ]);

  return {
    role: USER_ROLES.ATHLETE,
    activeProtocol: toActiveProtocol(activeProtocol),
    nextTracking: toNextTracking(nextTracking),
    currentCheckIn: toCurrentCheckIn(currentCheckIn),
    recentActivity,
    // Contrato reservado para integração com Notifications.
    unreadNotifications: 0,
    // Contrato reservado para integração com Inventory.
    inventoryAlerts: [],
  };
}

function limitedProfessionalDashboard(verificationStatus) {
  return {
    role: USER_ROLES.PROFESSIONAL,
    verificationStatus,
    athleteCount: 0,
    activeProtocols: 0,
    pendingCheckIns: 0,
    upcomingTrackings: [],
    recentActivity: [],
  };
}

async function getProfessionalDashboard(requester, now) {
  const profile = await ProfessionalProfile.findOne({
    userId: requester.id,
  })
    .select('verificationStatus')
    .lean();

  if (!profile) {
    throw new AppError(
      403,
      ERROR_CODES.PROFESSIONAL_VERIFICATION_REQUIRED,
      'Verificação profissional necessária.',
    );
  }

  if (
    [
      PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
      PROFESSIONAL_VERIFICATION_STATUSES.REJECTED,
    ].includes(profile.verificationStatus)
  ) {
    return limitedProfessionalDashboard(profile.verificationStatus);
  }

  if (
    profile.verificationStatus !==
    PROFESSIONAL_VERIFICATION_STATUSES.APPROVED
  ) {
    throw forbiddenError();
  }

  const activeAthleteIds = await ProfessionalAthleteLink.distinct(
    'athleteId',
    {
      professionalId: requester.id,
      status: LINK_STATUSES.ACTIVE,
    },
  );
  const operationalScope = {
    professionalId: requester._id,
    athleteId: { $in: activeAthleteIds },
  };

  const [
    activeProtocols,
    pendingCheckIns,
    upcomingTrackings,
    recentActivity,
  ] = await Promise.all([
    Protocol.countDocuments({
      ...operationalScope,
      status: PROTOCOL_STATUSES.ACTIVE,
    }),
    CheckIn.countDocuments({
      ...operationalScope,
      status: CHECK_IN_STATUSES.SUBMITTED,
    }),
    TrackingRecord.find({
      ...operationalScope,
      status: TRACKING_RECORD_STATUSES.SCHEDULED,
      scheduledFor: { $gte: now },
    })
      .select(
        '_id athleteId protocolId title type scheduledFor status createdAt',
      )
      .sort({ scheduledFor: 1, createdAt: 1, _id: 1 })
      .limit(DASHBOARD_LIST_LIMIT)
      .lean(),
    getRecentActivity(operationalScope, true),
  ]);

  return {
    role: USER_ROLES.PROFESSIONAL,
    verificationStatus: profile.verificationStatus,
    athleteCount: activeAthleteIds.length,
    activeProtocols,
    pendingCheckIns,
    upcomingTrackings: upcomingTrackings.map(toUpcomingTracking),
    recentActivity,
  };
}

async function getAdminDashboard() {
  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    usersByRole,
    professionalsPending,
    activeLinks,
    recentAudit,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ active: true, blockedAt: null }),
    User.countDocuments({ blockedAt: { $ne: null } }),
    User.aggregate([
      { $match: { role: { $in: Object.values(USER_ROLES) } } },
      { $group: { _id: '$role', total: { $sum: 1 } } },
    ]),
    ProfessionalProfile.countDocuments({
      verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
    }),
    ProfessionalAthleteLink.countDocuments({
      status: LINK_STATUSES.ACTIVE,
    }),
    AuditLog.find({})
      .select('_id actorId action entityType entityId createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(DASHBOARD_LIST_LIMIT)
      .lean(),
  ]);

  const byRole = {
    [USER_ROLES.ADMIN]: 0,
    [USER_ROLES.PROFESSIONAL]: 0,
    [USER_ROLES.ATHLETE]: 0,
  };
  for (const group of usersByRole) byRole[group._id] = group.total;

  return {
    role: USER_ROLES.ADMIN,
    users: {
      total: totalUsers,
      active: activeUsers,
      blocked: blockedUsers,
      byRole,
    },
    professionalsPending,
    activeLinks,
    recentAudit: recentAudit.map(toRecentAudit),
  };
}

async function getDashboard(requester, now = new Date()) {
  if (requester.role === USER_ROLES.ATHLETE) {
    return getAthleteDashboard(requester, now);
  }
  if (requester.role === USER_ROLES.PROFESSIONAL) {
    return getProfessionalDashboard(requester, now);
  }
  if (requester.role === USER_ROLES.ADMIN) {
    return getAdminDashboard();
  }

  throw forbiddenError();
}

module.exports = {
  DASHBOARD_LIST_LIMIT,
  getDashboard,
};
