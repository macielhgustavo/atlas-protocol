function toId(value) {
  return value ? value.toString() : null;
}

function toActiveProtocol(protocol) {
  if (!protocol) return null;

  return {
    id: toId(protocol._id),
    title: protocol.title,
    status: protocol.status,
    professionalId: toId(protocol.professionalId),
    currentVersion: protocol.currentVersion,
    startDate: protocol.startDate,
    endDate: protocol.endDate,
    continuous: protocol.continuous,
    activatedAt: protocol.activatedAt,
  };
}

function toNextTracking(tracking) {
  if (!tracking) return null;

  return {
    id: toId(tracking._id),
    title: tracking.title,
    type: tracking.type,
    scheduledFor: tracking.scheduledFor,
    status: tracking.status,
    protocolId: toId(tracking.protocolId),
    professionalId: toId(tracking.professionalId),
  };
}

function toCurrentCheckIn(checkIn) {
  if (!checkIn) return null;

  return {
    id: toId(checkIn._id),
    professionalId: toId(checkIn.professionalId),
    protocolId: toId(checkIn.protocolId),
    referenceWeek: checkIn.referenceWeek,
    status: checkIn.status,
    submittedAt: checkIn.submittedAt,
    reviewedAt: checkIn.reviewedAt,
  };
}

function toUpcomingTracking(tracking) {
  return {
    id: toId(tracking._id),
    athleteId: toId(tracking.athleteId),
    protocolId: toId(tracking.protocolId),
    title: tracking.title,
    type: tracking.type,
    scheduledFor: tracking.scheduledFor,
    status: tracking.status,
  };
}

function toActivityItem(activity, includeAthleteId = false) {
  const entityId = toId(activity._id);
  const item = {
    id: `${activity.type}:${entityId}`,
    type: activity.type,
    occurredAt: activity.occurredAt,
    title: activity.title,
    status: activity.status || null,
    entityId,
  };

  if (includeAthleteId) item.athleteId = toId(activity.athleteId);
  return item;
}

function toRecentAudit(auditLog) {
  return {
    id: toId(auditLog._id),
    actorId: toId(auditLog.actorId),
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: toId(auditLog.entityId),
    createdAt: auditLog.createdAt,
  };
}

module.exports = {
  toActiveProtocol,
  toActivityItem,
  toCurrentCheckIn,
  toNextTracking,
  toRecentAudit,
  toUpcomingTracking,
};
