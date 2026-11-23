'use strict';
class RateLimiter {
  constructor({ perPhone = 10, global = 120, windowMs = 3600000, now = Date.now } = {}) { this.perPhone = perPhone; this.global = global; this.windowMs = windowMs; this.now = now; this.calls = new Map(); }
  allow(phone = 'unknown') {
    const cutoff = this.now() - this.windowMs;
    for (const [key, times] of this.calls) { const alive = times.filter(t => t > cutoff); if (alive.length) this.calls.set(key, alive); else this.calls.delete(key); }
    const all = this.calls.get('*') || []; const own = this.calls.get(String(phone)) || [];
    if (all.length >= this.global || own.length >= this.perPhone) return false;
    const now = this.now(); this.calls.set('*', [...all, now]); this.calls.set(String(phone), [...own, now]); return true;
  }
}
module.exports = { RateLimiter };
