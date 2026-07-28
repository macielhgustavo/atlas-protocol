const REFERENCE_TIME_ZONE = 'America/Sao_Paulo';
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  calendar: 'gregory',
  day: '2-digit',
  month: '2-digit',
  numberingSystem: 'latn',
  timeZone: REFERENCE_TIME_ZONE,
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  calendar: 'gregory',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  month: '2-digit',
  numberingSystem: 'latn',
  second: '2-digit',
  timeZone: REFERENCE_TIME_ZONE,
  year: 'numeric',
});

function toNumericParts(formatter, value) {
  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

function localMidnightToUtc(year, month, day) {
  const desiredTimestamp = Date.UTC(year, month - 1, day);
  let candidateTimestamp = desiredTimestamp;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = toNumericParts(
      dateTimeFormatter,
      new Date(candidateTimestamp),
    );
    const representedTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const correction = desiredTimestamp - representedTimestamp;

    candidateTimestamp += correction;
    if (correction === 0) break;
  }

  return new Date(candidateTimestamp);
}

function normalizeLocalCalendarDate(year, month, day) {
  const localDate = new Date(Date.UTC(year, month - 1, day));
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() + 1 !== month ||
    localDate.getUTCDate() !== day
  ) {
    throw new RangeError('Informe uma data de referência válida.');
  }

  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);

  return localMidnightToUtc(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate(),
  );
}

function normalizeReferenceWeek(value) {
  if (value === null || value === undefined || value === '') {
    throw new RangeError('Informe uma data de referência válida.');
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
    if (dateOnlyMatch) {
      return normalizeLocalCalendarDate(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]),
        Number(dateOnlyMatch[3]),
      );
    }
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Informe uma data de referência válida.');
  }

  const localParts = toNumericParts(dateFormatter, date);
  return normalizeLocalCalendarDate(
    localParts.year,
    localParts.month,
    localParts.day,
  );
}

module.exports = { normalizeReferenceWeek, REFERENCE_TIME_ZONE };
