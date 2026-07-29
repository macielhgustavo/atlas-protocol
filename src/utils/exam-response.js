function toId(value) {
  return value ? value.toString() : null;
}

function toSafeDocument(document) {
  if (!document) return null;
  return {
    originalName: document.originalName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  };
}

function toExamResponse(exam) {
  return {
    id: exam.id,
    athleteId: toId(exam.athleteId),
    professionalId: toId(exam.professionalId),
    title: exam.title,
    examDate: exam.examDate,
    laboratory: exam.laboratory,
    results: exam.results.map((result) => ({
      marker: result.marker,
      value: result.value,
      unit: result.unit,
      referenceRange: result.referenceRange,
    })),
    document: toSafeDocument(exam.document),
    notes: exam.notes,
    archivedAt: exam.archivedAt,
    createdBy: toId(exam.createdBy),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

module.exports = { toExamResponse };
