const { cloneResponses } = require('./check-in-responses');

function toId(value) {
  return value ? value.toString() : null;
}

function toCheckInResponse(checkIn) {
  return {
    id: checkIn.id,
    athleteId: toId(checkIn.athleteId),
    professionalId: toId(checkIn.professionalId),
    protocolId: toId(checkIn.protocolId),
    referenceWeek: checkIn.referenceWeek,
    status: checkIn.status,
    responses: cloneResponses(checkIn.responses),
    submittedAt: checkIn.submittedAt,
    reviewedAt: checkIn.reviewedAt,
    reviewedBy: toId(checkIn.reviewedBy),
    reviewComment: checkIn.reviewComment,
    createdAt: checkIn.createdAt,
    updatedAt: checkIn.updatedAt,
  };
}

module.exports = toCheckInResponse;
