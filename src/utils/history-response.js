const MAX_SUMMARY_LENGTH = 300;
const MAX_TITLE_LENGTH = 160;

function truncate(value, maximumLength) {
  const text = String(value);
  return text.length <= maximumLength
    ? text
    : text.slice(0, maximumLength);
}

function toHistoryItem(event) {
  return {
    id: String(event.id),
    type: event.type,
    occurredAt: event.occurredAt,
    title: truncate(event.title, MAX_TITLE_LENGTH),
    summary: truncate(event.summary, MAX_SUMMARY_LENGTH),
    entityId: event.entityId.toString(),
  };
}

function compareHistoryItems(left, right) {
  const dateDifference =
    new Date(right.occurredAt).getTime() -
    new Date(left.occurredAt).getTime();
  if (dateDifference !== 0) return dateDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

module.exports = {
  compareHistoryItems,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  toHistoryItem,
};
