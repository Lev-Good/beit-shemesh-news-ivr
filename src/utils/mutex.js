'use strict';
class Mutex {
  #tail = Promise.resolve();
  async runExclusive(fn) {
    let release;
    const next = new Promise(resolve => { release = resolve; });
    const previous = this.#tail;
    this.#tail = previous.then(() => next);
    await previous;
    try { return await fn(); } finally { release(); }
  }
}
module.exports = { Mutex };
