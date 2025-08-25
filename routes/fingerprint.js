// routes/fingerprint.js
import { Fingerprint } from '../models/Fingerprint.js';
import { hashComponents } from '../utils/hash.js';

export async function fingerprintRouter({ redis }) {
    const express = (await import('express')).default;
    const router = express.Router();

    // READ-THROUGH CACHE: GET /apps/my-app/api/fingerprint/:shop/:visitorId
    router.get('/:shop/:visitorId', async (req, res) => {
        try {
            const { shop, visitorId } = req.params;
            const cacheKey = `fp:${shop}:${visitorId}`;

            // 1) Try Redis
            const cached = await redis.get(cacheKey);
            if (cached) {
                return res.json({ source: 'cache', data: JSON.parse(cached) });
            }

            // 2) Fallback to Mongo
            const doc = await Fingerprint.findOne({ shop, visitorId }).lean();
            if (!doc) return res.status(404).json({ message: 'Not found' });

            // 3) Warm cache
            await redis.set(cacheKey, JSON.stringify(doc), { EX: 60 * 60 * 24 }); // 24h
            return res.json({ source: 'db', data: doc });
        } catch (err) {
            console.error('[GET fingerprint] error', err);
            res.status(500).json({ message: 'Server error' });
        }
    });

    // WRITE (idempotent): POST /apps/my-app/api/fingerprint
    router.post('/', async (req, res) => {
        try {
            let data;
            if (Buffer.isBuffer(req.body)) {
                data = JSON.parse(req.body.toString('utf8'));
            } else if (typeof req.body === 'string') {
                data = JSON.parse(req.body);
            } else {
                data = req.body; // already parsed object
            }
            const {
                app,
                shop,
                fingerprint: agentClassification,
                visitorId,
                components,
            } = data;

            if (!shop || !visitorId || !agentClassification) {
                return res.status(400).json({ message: 'shop, visitorId, fingerprint are required' });
            }

            const ua = req.headers['user-agent'] || '';
            const ip =
                (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? '').trim() ||
                req.socket?.remoteAddress ||
                '';

            const componentsHash = components ? hashComponents(components) : undefined;

            // Cache key
            const cacheKey = `fp:${shop}:${visitorId}`;

            // Try to get existing from Mongo (small indexed query)
            const existing = await Fingerprint.findOne({ shop, visitorId });

            if (!existing) {
                // New doc
                const created = await Fingerprint.create({
                    shop,
                    visitorId,
                    agentClassification,
                    components,
                    componentsHash,
                    userAgent: ua,
                    ip,
                    firstSeenAt: new Date(),
                    lastSeenAt: new Date(),
                    hits: 1,
                });

                // Populate cache
                await redis.set(cacheKey, JSON.stringify(created.toObject()), { EX: 60 * 60 * 24 });
                return res.status(201).json({ created: true });
            }

            // If nothing meaningful changed, do NOT update DB (your “no updates happen” rule)
            const nothingChanged =
                existing.agentClassification === agentClassification &&
                existing.componentsHash === componentsHash &&
                existing.userAgent === ua &&
                existing.ip === ip;

            if (nothingChanged) {
                // Optionally just bump cache TTL without DB write
                await redis.expire(cacheKey, 60 * 60 * 24);
                return res.json({ updated: false, reason: 'no-change' });
            }

            // Otherwise, update minimally
            existing.agentClassification = agentClassification;
            if (components) {
                existing.components = components;
                existing.componentsHash = componentsHash;
            }
            existing.userAgent = ua;
            existing.ip = ip;
            existing.lastSeenAt = new Date();
            existing.hits = (existing.hits || 0) + 1;

            await existing.save();

            // Refresh cache
            await redis.set(cacheKey, JSON.stringify(existing.toObject()), { EX: 60 * 60 * 24 });

            return res.json({ updated: true });
        } catch (err) {
            console.error('[POST fingerprint] error', err);
            return res.status(500).json({ message: 'Server error' });
        }
    });

    return router;
}
