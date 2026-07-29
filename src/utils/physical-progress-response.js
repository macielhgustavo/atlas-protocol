const MEASUREMENT_FIELDS = [
  'chestCm',
  'waistCm',
  'armCm',
  'thighCm',
  'calfCm',
];

function toId(value) {
  return value ? value.toString() : null;
}

function toMeasurementsResponse(measurements) {
  return Object.fromEntries(
    MEASUREMENT_FIELDS.map((field) => [field, measurements?.[field] ?? null]),
  );
}

function toPhysicalProgressResponse(progress) {
  return {
    id: progress.id,
    athleteId: toId(progress.athleteId),
    recordedBy: toId(progress.recordedBy),
    referenceDate: progress.referenceDate,
    weightKg: progress.weightKg ?? null,
    bodyFatPercent: progress.bodyFatPercent ?? null,
    measurements: toMeasurementsResponse(progress.measurements),
    notes: progress.notes ?? null,
    archivedAt: progress.archivedAt,
    createdAt: progress.createdAt,
    updatedAt: progress.updatedAt,
  };
}

module.exports = {
  MEASUREMENT_FIELDS,
  toMeasurementsResponse,
  toPhysicalProgressResponse,
};
