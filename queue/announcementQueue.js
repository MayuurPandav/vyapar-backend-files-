const Queue = require('bull');
const Redis = require('ioredis');
const path = require('path');

const redisUrl = process.env.REDIS_URL || `redis://127.0.0.1:6379`;
const opts = {
  redis: {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    }
  }
};

const announcementQueue = new Queue('announcement-queue', redisUrl, opts);
announcementQueue.on('error', () => { /* Redis connection error fallback */ });

// helper to add job
async function enqueueDeliveryJob(announcementId, channel, recipient, payload) {
  try {
    await announcementQueue.add('deliver', { announcementId, channel, recipient, payload }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
  } catch (err) {
    console.warn('[Queue] Could not enqueue delivery job (Redis offline)');
  }
}

module.exports = { announcementQueue, enqueueDeliveryJob };
