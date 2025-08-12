const Store = require('./models/Store');

let storeTokenCache = {};
let storefrontTokenCache = {};

function getCacheKey(domain, app) {
  return `${domain}::${app || "default"}`;
}

async function getCachedStoreToken(domain, app) {
  const key = getCacheKey(domain, app);
  if (storeTokenCache[key]) return storeTokenCache[key];

  const store = await Store.findOne({ shop: domain, app }).lean();
  if (store) {
    storeTokenCache[key] = store.accessToken;
    return store.accessToken;
  }
  return null;
}

async function getCachedStorefrontToken(domain, app) {
  const key = getCacheKey(domain, app);
  if (storefrontTokenCache[key]) return storefrontTokenCache[key];

  const store = await Store.findOne({ shop: domain, app }).lean();
  if (store) {
    storefrontTokenCache[key] = store.storefrontAccessToken;
    return store.storefrontAccessToken;
  }
  return null;
}

function updateStoreTokenCache(domain, token, app) {
  storeTokenCache[getCacheKey(domain, app)] = token;
}

const updateStoreFrontTokenCache = async (domain, token, app) => {
  storefrontTokenCache[getCacheKey(domain, app)] = token;
  await Store.updateOne(
    { shop: domain, app },
    { $set: { storefrontAccessToken: token } },
    { upsert: true }
  );
};

module.exports = { getCachedStoreToken, updateStoreTokenCache, getCachedStorefrontToken, updateStoreFrontTokenCache };
