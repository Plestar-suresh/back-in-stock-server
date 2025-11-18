const mongoose = require("mongoose");

const BillingSchema = new mongoose.Schema({
  store: { type: String},
  storeDomain: { type: String},
  plan: { type: String},
  price: { type: String},
  chargeId: { type: String},
  status: { type: String},
  app:{ type: String},
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Billing", BillingSchema);
