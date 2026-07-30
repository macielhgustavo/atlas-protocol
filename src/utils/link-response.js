function toId(value) {
  return value ? value.toString() : null;
}

function toUserSummary(user) {
  if (!user) {
    return null;
  }

  return {
    id: toId(user._id || user.id),
    name: user.name,
    email: user.email,
  };
}

function toLinkResponse(link, athlete = null, professional = null) {
  return {
    id: link.id,
    professionalId: toId(link.professionalId),
    athleteId: toId(link.athleteId),

    athlete: toUserSummary(athlete),
    professional: toUserSummary(professional),

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
