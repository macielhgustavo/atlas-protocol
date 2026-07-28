function objectIdToString(value) {
  return value ? value.toString() : null;
}

function toTrackingRecordResponse(trackingRecord) {
  return {
    id: trackingRecord.id,
    athleteId: objectIdToString(trackingRecord.athleteId),
    professionalId: objectIdToString(trackingRecord.professionalId),
    protocolId: objectIdToString(trackingRecord.protocolId),
    protocolVersion: trackingRecord.protocolVersion,
    type: trackingRecord.type,
    title: trackingRecord.title,
    scheduledFor: trackingRecord.scheduledFor,
    status: trackingRecord.status,
    statusReason: trackingRecord.statusReason,
    completedAt: trackingRecord.completedAt,
    completedBy: objectIdToString(trackingRecord.completedBy),
    notes: trackingRecord.notes,
    createdBy: objectIdToString(trackingRecord.createdBy),
    createdAt: trackingRecord.createdAt,
    updatedAt: trackingRecord.updatedAt,
  };
}

module.exports = { toTrackingRecordResponse };
