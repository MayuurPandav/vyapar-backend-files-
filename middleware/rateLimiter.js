// Simple in-memory rate limiter per actor for bursts. For production, use Redis.
const limits = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_PER_WINDOW = Number(process.env.NOTIFY_RATE_LIMIT || 60);

module.exports = function rateLimiter(req, res, next) {
  const actor = req.body.actor || req.body.username || req.query.username || req.ip;
  const now = Date.now();
  const entry = limits.get(actor) || { count: 0, start: now };
  if (now - entry.start > WINDOW_MS) {
    entry.count = 0; entry.start = now;
  }
  entry.count++;
  limits.set(actor, entry);
  if (entry.count > MAX_PER_WINDOW) {
    return res.status(429).json({ status: 'error', message: 'Rate limit exceeded' });
  }
  next();
};
