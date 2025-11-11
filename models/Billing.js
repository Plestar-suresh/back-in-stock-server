const mongoose = require("mongoose");

const BillingSchema = new mongoose.Schema({
  store: { type: String, required: true },
  plan: { type: String, required: true },
  price: { type: String, required: true },
  chargeId: { type: String, required: true, unique: true },
  status: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Billing", BillingSchema);
