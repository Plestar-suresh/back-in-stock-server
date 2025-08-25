// db/redis.js
import { createClient } from 'redis';

let client;

export async function getRedis(url) {
  if (client?.isOpen) return client;
  client = createClient({ url });
  client.on('error', (err) => console.error('[Redis] error', err));
  await client.connect();
  console.log('[Redis] connected');
  return client;
}
