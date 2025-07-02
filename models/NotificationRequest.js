const mongoose = require('mongoose');

const NotificationRequestSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true },
  productId: { type: String, required: true },
  variantId: { type: String, required: true },
  inventoryItemId: String,
  variantTitle: String,
  productTitle: String,
  productImage: String,
  productHandle: String,
  notified: { type: Boolean, default: false },
  storeDomain: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('NotificationRequest', NotificationRequestSchema);
