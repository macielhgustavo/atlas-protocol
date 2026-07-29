const bcrypt = require('bcrypt');

const env = require('../config/env');
const AUDIT_ACTIONS = require('../constants/audit-actions');
const AUDIT_ENTITY_TYPES = require('../constants/audit-entity-types');
const ERROR_CODES = require('../constants/error-codes');
const PROFESSIONAL_VERIFICATION_STATUSES = require(
  '../constants/professional-verification-statuses'
);
const USER_ROLES = require('../constants/user-roles');
const ProfessionalProfile = require('../models/professional-profile');
const User = require('../models/user');
const auditService = require('./audit-service');
const storage = require('../storage');
const AppError = require('../utils/app-error');
const { generateToken } = require('../utils/jwt');
const { sanitizeOriginalName } = require('../utils/pdf-file');
const toSafeUser = require('../utils/user-response');

function invalidCredentialsError() {
  return new AppError(
    401,
    ERROR_CODES.INVALID_CREDENTIALS,
    'E-mail ou senha inválidos.',
  );
}

function blockedUserError() {
  return new AppError(
    403,
    ERROR_CODES.USER_BLOCKED,
    'Usuário bloqueado ou inativo.',
  );
}

function emailAlreadyExistsError() {
  return new AppError(
    409,
    ERROR_CODES.EMAIL_ALREADY_EXISTS,
    'Já existe um usuário com este e-mail.',
  );
}

function professionalVerificationRequiredError() {
  return new AppError(
    403,
    ERROR_CODES.PROFESSIONAL_VERIFICATION_REQUIRED,
    'Verificação profissional necessária.',
  );
}

async function getProfessionalProfile(userId) {
  const profile = await ProfessionalProfile.findOne({ userId });

  if (!profile) {
    throw professionalVerificationRequiredError();
  }

  return profile;
}

function toSafeProfessionalUser(user, profile, includeRejectionReason = false) {
  const safeUser = {
    ...toSafeUser(user),
    verificationStatus: profile.verificationStatus,
  };

  if (
    includeRejectionReason &&
    profile.verificationStatus === PROFESSIONAL_VERIFICATION_STATUSES.REJECTED
  ) {
    safeUser.rejectionReason = profile.rejectionReason;
  }

  return safeUser;
}

async function register({ name, email, password }) {
  const existingUser = await User.exists({ email });

  if (existingUser) {
    throw emailAlreadyExistsError();
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);

  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash,
      role: USER_ROLES.ATHLETE,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw emailAlreadyExistsError();
    }
    throw error;
  }

  return { user: toSafeUser(user), token: generateToken(user) };
}

async function registerProfessional({ name, email, password }, document) {
  if (!document) {
    throw new AppError(
      400,
      ERROR_CODES.PROFESSIONAL_VERIFICATION_REQUIRED,
      'Envie o documento profissional em PDF.',
    );
  }

  const existingUser = await User.exists({ email });

  if (existingUser) {
    throw emailAlreadyExistsError();
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptSaltRounds);
  let profile;
  let storedDocument;
  let user;

  try {
    storedDocument = await storage.store(document);
    user = await User.create({
      name,
      email,
      passwordHash,
      role: USER_ROLES.PROFESSIONAL,
    });
    profile = await ProfessionalProfile.create({
      userId: user.id,
      verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
      verificationDocument: {
        ...storedDocument,
        originalName: sanitizeOriginalName(document.originalname),
        mimeType: document.mimetype,
        sizeBytes: document.size,
      },
    });
    await auditService.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.PROFESSIONAL_REGISTERED,
      entityType: AUDIT_ENTITY_TYPES.PROFESSIONAL_PROFILE,
      entityId: profile.id,
      metadata: {
        verificationStatus: PROFESSIONAL_VERIFICATION_STATUSES.PENDING,
      },
    });
  } catch (error) {
    const cleanupOperations = [];

    if (profile) {
      cleanupOperations.push(
        ProfessionalProfile.deleteOne({ _id: profile.id }),
      );
    }
    if (user) {
      cleanupOperations.push(User.deleteOne({ _id: user.id }));
    }
    if (storedDocument) {
      cleanupOperations.push(storage.remove(storedDocument.storageKey));
    }

    await Promise.allSettled(cleanupOperations);

    if (error.code === 11000) {
      throw emailAlreadyExistsError();
    }

    throw error;
  }

  return {
    user: toSafeUser(user),
    verification: {
      status: profile.verificationStatus,
      submittedAt: profile.submittedAt,
    },
    token: generateToken(user),
  };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw invalidCredentialsError();
  }

  if (!user.active || user.blockedAt) {
    throw blockedUserError();
  }

  let safeUser = toSafeUser(user);

  if (user.role === USER_ROLES.PROFESSIONAL) {
    const profile = await getProfessionalProfile(user.id);
    safeUser = toSafeProfessionalUser(user, profile);
  }

  user.lastLoginAt = new Date();
  await user.save();

  return { user: safeUser, token: generateToken(user) };
}

async function getCurrentUser(userId) {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      'Usuário não encontrado.',
    );
  }

  if (user.role === USER_ROLES.PROFESSIONAL) {
    const profile = await getProfessionalProfile(user.id);
    return toSafeProfessionalUser(user, profile, true);
  }

  return toSafeUser(user);
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw invalidCredentialsError();
  }

  user.passwordHash = await bcrypt.hash(
    newPassword,
    env.bcryptSaltRounds,
  );
  await user.save();

  return toSafeUser(user);
}

module.exports = {
  changePassword,
  getCurrentUser,
  login,
  register,
  registerProfessional,
};
