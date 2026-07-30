function toId(value) {
  return value ? value.toString() : null;
}

function toAthleteSummary(athlete) {
  if (!athlete) {
    return null;
  }

  return {
    id: toId(athlete._id || athlete.id),
    name: athlete.name,
    email: athlete.email,
  };
}

function toLinkResponse(link, athlete = null) {
  return {
    id: link.id,
    professionalId: toId(link.professionalId),
    athleteId: toId(link.athleteId),

    athlete: toAthleteSummary(athlete),

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