const Store = require('./models/Store');

let storeTokenCache = {};
let storefrontTokenCache = {};

async function getCachedStoreToken(domain) {
  if (storeTokenCache[domain]) return storeTokenCache[domain];

  const store = await Store.findOne({ shop: domain }).lean();
  if (store) {
    storeTokenCache[domain] = store.accessToken;
    return store.accessToken;
  }
  return null;
}

async function getCachedStorefrontToken(domain) {
  if (storefrontTokenCache[domain]) return storefrontTokenCache[domain];

  const store = await Store.findOne({ shop: domain }).lean();
  if (store) {
    storefrontTokenCache[domain] = store.storefrontAccessToken;
    return store.storefrontAccessToken;
  }
  return null;
}

function updateStoreTokenCache(domain, token) {
  storeTokenCache[domain] = token;
}

const updateStoreFrontTokenCache = async(domain, token)=> {
  storefrontTokenCache[domain] = token;
  await Store.updateOne(
      { shop },
      { $set: { storefrontAccessToken: storefrontToken } },
      { upsert: true }
    );
}

module.exports = { getCachedStoreToken, updateStoreTokenCache , getCachedStorefrontToken, updateStoreFrontTokenCache};
