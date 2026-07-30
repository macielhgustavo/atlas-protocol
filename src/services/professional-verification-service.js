const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const NOTIFICATION_ENTITY_TYPES = require(
  '../constants/notification-entity-types',
);
const NOTIFICATION_TYPES = require('../constants/notification-types');
const PROFESSIONAL_VERIFICATION_STATUSES = require(
  '../constants/professional-verification-statuses',
);
const USER_ROLES = require('../constants/user-roles');
const ProfessionalProfile = require('../models/professional-profile');
const User = require('../models/user');
const storage = require('../storage');
const AppError = require('../utils/app-error');
const { sanitizeOriginalName } = require('../utils/pdf-file');
const toProfessionalVerificationResponse = require('../utils/professional-verification-response');
const auditService = require('./audit-service');
const notificationService = require('./notification-service');

const SAFE_USER_FIELDS = 'name email role active';

function notFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Verificação profissional não encontrada.',
  );
}

function alreadyReviewedError() {
  return new AppError(
    409,
    ERROR_CODES.PROFESSIONAL_ALREADY_REVIEWED,
    'Esta verificação profissional já foi analisada.',
  );
}

function documentNotFoundError() {
  return new AppError(
    404,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    'Documento da verificação profissional não encontrado.',
  );
}

function sameId(left, right) {
  return Boolean(left && right && left.toString() === right.toString());
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function populateProfessional(query) {
  return query.populate({ path: 'userId', select: SAFE_USER_FIELDS });
}

async function findProfessionalIds(search) {
  const expression = new RegExp(escapeRegExp(search), 'i');
  const professionals = await User.find({
    role: USER_ROLES.PROFESSIONAL,
    $or: [{ name: expression }, { email: expression }],
  })
    .select('_id')
    .lean();

  return professionals.map((professional) => professional._id);
}

async function listProfessionalVerifications({
  page = 1,
  limit = 20,
  status,
  search,
}) {
  const filters = {};
  if (status) filters.verificationStatus = status;
  if (search) filters.userId = { $in: await findProfessionalIds(search) };

  const skip = (page - 1) * limit;
  const [profiles, total] = await Promise.all([
    populateProfessional(
      ProfessionalProfile.find(filters)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit),
    ),
    ProfessionalProfile.countDocuments(filters),
  ]);

  return {
    verifications: profiles.map((profile) =>
      toProfessionalVerificationResponse(profile),
    ),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function getOwnProfessionalVerification(userId) {
  const profile = await populateProfessional(
    ProfessionalProfile.findOne({ userId }),
  );
  if (!profile) throw notFoundError();

  return toProfessionalVerificationResponse(profile, {
    includeDocument: true,
  });
}

async function getProfessionalVerificationById(profileId) {
  const profile = await populateProfessional(
    ProfessionalProfile.findById(profileId),
  );
  if (!profile) throw notFoundError();

  return toProfessionalVerificationResponse(profile, {
    includeDocument: true,
  });
}

async function getProfessionalVerificationDocument(requester, profileId) {
  const profile = await ProfessionalProfile.findById(profileId).select(
    '+verificationDocument.storageKey',
  );
  if (!profile) throw notFoundError();

  if (
    requester.role !== USER_ROLES.ADMIN &&
    !sameId(profile.userId, requester.id)
  ) {
    throw notFoundError();
  }
  if (!profile.verificationDocument?.storageKey) {
    throw documentNotFoundError();
  }

  let buffer;
  try {
    buffer = await storage.read(profile.verificationDocument.storageKey);
  } catch (error) {
    if (error instanceof TypeError) throw documentNotFoundError();
    throw error;
  }
  if (!buffer) throw documentNotFoundError();

  return {
    buffer,
    originalName: sanitizeOriginalName(
      profile.verificationDocument.originalName,
    ),
  };
}

async function transitionPendingVerification(
  profileId,
  reviewerId,
  update,
  auditAction,
) {
  const profile = await ProfessionalProfile.findOneAndUpdate(
    {
      _id: profileId,
      verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
    },
    {
      $set: {
        ...update,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
    },
    { new: true, runValidators: true },
  );

  if (!profile) {
    const exists = await ProfessionalProfile.exists({ _id: profileId });
    if (!exists) throw notFoundError();
    throw alreadyReviewedError();
  }

  await auditService.record({
    actorId: reviewerId,
    action: auditAction,
    entityType: AUDIT_ENTITY_TYPES.PROFESSIONAL_PROFILE,
    entityId: profile.id,
    metadata: {
      from: PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
      to: profile.verificationStatus,
    },
  });

  const notificationType =
    profile.verificationStatus ===
    PROFESSIONAL_VERIFICATION_STATUSES.APPROVED
      ? NOTIFICATION_TYPES.PROFESSIONAL_APPROVED
      : NOTIFICATION_TYPES.PROFESSIONAL_REJECTED;
  await notificationService.createNotificationFromTemplateSafely({
    userId: profile.userId,
    type: notificationType,
    entityType: NOTIFICATION_ENTITY_TYPES.PROFESSIONAL_PROFILE,
    entityId: profile.id,
  });

  await profile.populate({ path: 'userId', select: SAFE_USER_FIELDS });
  return toProfessionalVerificationResponse(profile, {
    includeDocument: true,
  });
}

function approveProfessionalVerification(profileId, reviewerId) {
  return transitionPendingVerification(profileId, reviewerId, {
    verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.APPROVED,
    rejectionReason: null,
  }, AUDIT_ACTIONS.PROFESSIONAL_APPROVED);
}

function rejectProfessionalVerification(profileId, reviewerId, reason) {
  return transitionPendingVerification(profileId, reviewerId, {
    verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.REJECTED,
    rejectionReason: reason,
  }, AUDIT_ACTIONS.PROFESSIONAL_REJECTED);
}

module.exports = {
  approveProfessionalVerification,
  getOwnProfessionalVerification,
  getProfessionalVerificationById,
  getProfessionalVerificationDocument,
  listProfessionalVerifications,
  rejectProfessionalVerification,
};
