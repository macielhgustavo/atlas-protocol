function toId(value) {
  return value ? value.toString() : null;
}

function toLinkResponse(link) {
  return {
    id: link.id,
    professionalId: toId(link.professionalId),
    athleteId: toId(link.athleteId),
    status: link.status,
    requestedAt: link.requestedAt,
    acceptedAt: link.acceptedAt,
    rejectedAt: link.rejectedAt,
    endedAt: link.endedAt,
    endedBy: toId(link.endedBy),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

module.exports = toLinkResponse;
