'use strict';
function log(level, stage, message, callId = '-') {
  const row = { timestamp: new Date().toISOString(), level, callId, stage, message: String(message?.message || message) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(row));
}
module.exports = { log };
