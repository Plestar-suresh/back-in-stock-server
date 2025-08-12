const mongoose = require('mongoose');

const StoreSchema = new mongoose.Schema({
  shop: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true },
  app : String,
  createdAt: String,
  updatedAt: String,
  uninstall: { type: Boolean, default: false }

});

module.exports = mongoose.model('Store', StoreSchema);
