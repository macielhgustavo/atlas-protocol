function error(event, details = {}) {
  console.error(JSON.stringify({ event, ...details }));
}

module.exports = { error };
