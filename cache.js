const Store = require('./models/Store');

let storeTokenCache = {};

async function getCachedStoreToken(domain) {
  if (storeTokenCache[domain]) return storeTokenCache[domain];

  const store = await Store.findOne({ shop: domain }).lean();
  if (store) {
    storeTokenCache[domain] = store.accessToken;
    return store.accessToken;
  }
  return null;
}

function updateStoreTokenCache(domain, token) {
  storeTokenCache[domain] = token;
}

module.exports = { getCachedStoreToken, updateStoreTokenCache };
