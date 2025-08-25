// utils/hash.js
import crypto from 'crypto';

function stableStringify(obj) {
  // sort keys recursively to avoid order differences
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = stableStringify(obj[k]);
    }
    return sorted;
  }
  if (Array.isArray(obj)) {
    return obj.map(stableStringify);
  }
  return obj;
}

export function hashComponents(components) {
  const normalized = JSON.stringify(stableStringify(components));
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
