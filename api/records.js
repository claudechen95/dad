const { Redis } = require('@upstash/redis');

const HASH_KEY = 'gambling:records';

// In-memory fallback for local dev without Upstash env vars
const memStore = {};

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // Only use Redis if credentials look real (not placeholder template values)
  if (url && token && url.startsWith('https://') && !url.includes('YOUR_') && !token.includes('YOUR_')) {
    return new Redis({ url, token });
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const redis = getRedis();

  try {
    if (req.method === 'GET') {
      if (redis) {
        const raw = await redis.hgetall(HASH_KEY);
        // hgetall returns null when key doesn't exist; values are auto-parsed by SDK
        return res.status(200).json(raw ?? {});
      }
      return res.status(200).json({ ...memStore });
    }

    if (req.method === 'POST') {
      const { date, type, amount, note } = req.body || {};
      if (!date || !type || amount == null) {
        return res.status(400).json({ error: '缺少必要字段' });
      }
      const record = {
        type,
        amount: parseFloat(amount),
        note: (note || '').trim(),
        updatedAt: Date.now(),
      };
      if (redis) {
        // Store as plain object; @upstash/redis SDK auto-serializes/deserializes
        await redis.hset(HASH_KEY, { [date]: record });
      } else {
        memStore[date] = record;
      }
      return res.status(200).json({ date, ...record });
    }

    if (req.method === 'DELETE') {
      const { date } = req.query;
      if (!date) return res.status(400).json({ error: '缺少日期参数' });
      if (redis) {
        await redis.hdel(HASH_KEY, date);
      } else {
        delete memStore[date];
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: '不支持的请求方法' });
  } catch (err) {
    console.error('[records] error:', err);
    return res.status(500).json({ error: '服务器错误，请稍后重试' });
  }
};
