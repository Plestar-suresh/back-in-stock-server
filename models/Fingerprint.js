import mongoose from 'mongoose';

const FingerprintSchema = new mongoose.Schema(
  {
    shop: { type: String, required: true, index: true },
    app: { type: String, required: true, index: true },
    visitorId: { type: String, required: true, index: true },
    agentClassification: { type: String, enum: ['Likely Human', 'Likely AI Agent'], required: true },
    // store a normalized snapshot of important bits for change detection
    visitDay: { type: Date, required: true },
    componentsHash: { type: String, index: true },
    components: { type: mongoose.Schema.Types.Mixed }, // raw FingerprintJS components
    userAgent: { type: String },
    ip: { type: String },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    hits: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// Ensure uniqueness per (shop, visitorId)
FingerprintSchema.index({ shop: 1, visitorId: 1 , visitDay: 1}, { unique: true });

export const Fingerprint = mongoose.model('Fingerprint', FingerprintSchema);
