const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
  shop: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true },
  createdAt: String,
  updatedAt: String
});

module.exports = mongoose.model('Store', StoreSchema);
