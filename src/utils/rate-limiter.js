export class RateLimiter {
  constructor({ delayMs = 150, batchSize = 5 } = {}) {
    this._delayMs = delayMs;
    this._batchSize = batchSize;
    this._queue = [];
    this._processing = false;
    this._timer = null;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject });
      if (!this._processing) {
        this._processing = true;
        // Defer to microtask so synchronously-enqueued items batch together
        Promise.resolve().then(() => this._processBatch());
      }
    });
  }

  async _processBatch() {
    this._timer = null;

    if (this._queue.length === 0) {
      this._processing = false;
      return;
    }

    const batch = this._queue.splice(0, this._batchSize);

    await Promise.all(
      batch.map(async ({ fn, resolve, reject }) => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      })
    );

    if (this._queue.length > 0) {
      this._timer = setTimeout(() => this._processBatch(), this._delayMs);
    } else {
      this._processing = false;
    }
  }

  slowDown() {
    this._delayMs = Math.min(this._delayMs * 2, 5000);
  }

  resetSpeed() {
    this._delayMs = 150;
  }

  destroy() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._queue = [];
    this._processing = false;
  }
}
