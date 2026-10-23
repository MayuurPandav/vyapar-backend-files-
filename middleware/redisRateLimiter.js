const memoryLimiter = require('./rateLimiter');

let redis = null;
let isRedisReady = false;

// Only initialize Redis if explicitly provided via environment
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 2) return null;
        return null;
      }
    });

    redis.on('ready', () => { isRedisReady = true; });
    redis.on('close', () => { isRedisReady = false; });
    redis.on('error', () => { isRedisReady = false; });

    redis.connect().catch(() => {
      isRedisReady = false;
    });
  } catch (err) {
    isRedisReady = false;
  }
}

module.exports = async function redisRateLimiter(req, res, next) {
  // If Redis is not connected, use simple zero-error in-memory limiter
  if (!isRedisReady || !redis) {
    return memoryLimiter(req, res, next);
  }

  const key = `rl:${req.body?.actor || req.body?.username || req.ip}`;
  const windowMs = Number(process.env.NOTIFY_RATE_WINDOW_MS) || 60 * 1000;
  const max = Number(process.env.NOTIFY_RATE_LIMIT) || 60;

  try {
    const tx = redis.multi();
    tx.incr(key);
    tx.pttl(key);
    const [count, ttl] = await tx.exec().then(r => r.map(x => x[1]));
    if (ttl[0] === -1) await redis.pexpire(key, windowMs);
    if (Number(count[0]) > max) {
      return res.status(429).json({ status: 'error', message: 'Rate limit exceeded' });
    }
    return next();
  } catch (err) {
    return memoryLimiter(req, res, next);
  }
};
