import { RateLimiter } from '../../src/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    jest.useFakeTimers();
    limiter = new RateLimiter({ delayMs: 100, batchSize: 3 });
  });

  afterEach(() => {
    limiter.destroy();
    jest.useRealTimers();
  });

  test('executes single request immediately', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const promise = limiter.enqueue(fn);
    // Flush microtask (queueMicrotask) + async fn resolution
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const result = await promise;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('result');
  });

  test('batches multiple requests', async () => {
    const fn1 = jest.fn().mockResolvedValue('a');
    const fn2 = jest.fn().mockResolvedValue('b');
    const fn3 = jest.fn().mockResolvedValue('c');

    const p1 = limiter.enqueue(fn1);
    const p2 = limiter.enqueue(fn2);
    const p3 = limiter.enqueue(fn3);

    // Flush microtasks for batch processing
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  test('delays between batches', async () => {
    const calls = [];
    const makeFn = (id) => jest.fn().mockImplementation(() => {
      calls.push(id);
      return Promise.resolve(id);
    });

    const promises = [1, 2, 3, 4, 5].map(id => limiter.enqueue(makeFn(id)));

    // Flush microtasks for first batch (3 items via queueMicrotask)
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(calls.length).toBe(3);

    // Advance past the 100ms inter-batch delay, then flush next batch microtasks
    jest.advanceTimersByTime(100);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(calls.length).toBe(5);

    await Promise.all(promises);
  });

  test('slowDown increases delay', () => {
    expect(limiter._delayMs).toBe(100);
    limiter.slowDown();
    expect(limiter._delayMs).toBe(200);
    limiter.slowDown();
    expect(limiter._delayMs).toBe(400);
  });
});
