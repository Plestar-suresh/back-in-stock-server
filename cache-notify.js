const NotificationRequest = require('./models/NotificationRequest');

let notificationCache = {};

async function createNotificationAndCache(data) {
  const newRequest = await NotificationRequest.create(data);
  const inventoryItemId = newRequest.inventoryItemId;

  if (!notificationCache[inventoryItemId]) {
    notificationCache[inventoryItemId] = [];
  }

  notificationCache[inventoryItemId].push(newRequest.toObject());
  return newRequest;
}



async function getCachedNotificationRequests(inventoryItemId) {
  if (notificationCache[inventoryItemId]) return notificationCache[inventoryItemId];

  const requests = await NotificationRequest.find({
    inventoryItemId: inventoryItemId,
    notified: false
  }).lean();

  notificationCache[inventoryItemId] = requests;
  return requests;
}

async function markNotifiedAndUpdateCache(id, inventoryItemId) {
  await NotificationRequest.findByIdAndUpdate(id, { notified: true }, { new: true });

  if (notificationCache[inventoryItemId]) {
    notificationCache[inventoryItemId] = notificationCache[inventoryItemId].filter(r => r._id.toString() !== id.toString());
  }
}

async function getCachedSingleNotification(email, productId, variantId, storeDomain, inventoryItemId) {
  if (notificationCache[inventoryItemId]) {
    return notificationCache[inventoryItemId].find(req =>
      req.email === email &&
      req.productId === productId &&
      req.variantId === variantId &&
      req.storeDomain === storeDomain &&
      req.notified === false
    );
  }

  return await NotificationRequest.findOne({
    email,
    productId,
    variantId,
    storeDomain,
    notified: false
  }).lean();
}


module.exports = {
  getCachedNotificationRequests,
  markNotifiedAndUpdateCache,
  getCachedSingleNotification,
  createNotificationAndCache
};