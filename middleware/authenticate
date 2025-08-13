import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const authenticateShopifyWebhook = (req, res, next) => {
  const apiSecret = process.env.API_SECRET;
  if (!apiSecret) {
    return res
      .status(500)
      .json({ response: "error", message: "API_SECRET is not set" });
  }

  // 1️⃣ Check for Webhook HMAC header authentication
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (hmacHeader) {
    try {
      const bodyBuffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string"
              ? req.body
              : JSON.stringify(req.body),
            "utf8"
          );

      const generatedHmac = crypto
        .createHmac("sha256", apiSecret)
        .update(bodyBuffer)
        .digest("base64");

      if (generatedHmac === hmacHeader) {
        return next(); // ✅ Webhook authenticated
      }

      return res
        .status(401)
        .json({ response: "error", message: "Access denied. Invalid webhook token." });
    } catch (err) {
      return res
        .status(400)
        .json({ response: "error", message: "Error validating webhook request.", error: err });
    }
  }

  // 2️⃣ Check for App Proxy signature authentication
  if (req.query && req.query.signature) {
    try {
      const { signature, ...params } = req.query;
      const sorted = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("");

      const digest = crypto
        .createHmac("sha256", apiSecret)
        .update(sorted)
        .digest("hex");

      if (digest === signature) {
        return next(); // ✅ App proxy authenticated
      }

      return res
        .status(401)
        .json({ response: "error", message: "Access denied. Invalid app proxy signature." });
    } catch (err) {
      return res
        .status(400)
        .json({ response: "error", message: "Error validating app proxy request.", error: err });
    }
  }

  // ❌ Neither webhook HMAC nor app proxy signature was present
  return res
    .status(401)
    .json({ response: "error", message: "Access denied. No valid authentication provided." });
};

module.exports = authenticateShopifyWebhook;
