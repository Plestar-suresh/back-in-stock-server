const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const https = require('https');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(bodyParser.json());

const FILE_PATH = __dirname + '/data.json';

const STORES_FILE = __dirname + "/stores.json";

// Helper to load store data
function loadStores() {
  if (!fs.existsSync(STORES_FILE)) {
    return [];
  }
  const rawData = fs.readFileSync(STORES_FILE);
  return JSON.parse(rawData);
}

function saveStores(stores) {
  fs.writeFileSync(STORES_FILE, JSON.stringify(stores, null, 2));
}

// Load existing data or initialize empty
let data = [];
if (fs.existsSync(FILE_PATH)) {
  data = JSON.parse(fs.readFileSync(FILE_PATH));
}
function getStoreToken(storeDomain) {
  if (!fs.existsSync(STORES_FILE)) return null;
  const stores = JSON.parse(fs.readFileSync(STORES_FILE));
  const store = stores.find(s => s.shop === storeDomain);
  return store ? store.accessToken : null;
}

// Fetch inventory item ID using variant ID
async function getInventoryItemId(storeDomain, accessToken, variantId) {
  const url = `https://${storeDomain}/admin/api/2025-07/variants/${variantId}.json`;
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const raw = await response.text();
    console.error("❌ Shopify API Error Response:", raw);
    throw new Error(`Failed to fetch variant: ${response.statusText}`);
  }

  const json = await response.json();
  const variant = json?.variant;
  return {
    inventoryItemId: variant?.inventory_item_id,
    variantTitle: variant?.title || ""
  };
}

app.post('/api/notify', async (req, res) => {
  const { name, email, productId, variantId, productTitle, productImage, productHandle, storeDomain } = req.body;

  if (!email || !productId || !variantId || !storeDomain) {
    console.log("❌ Missing required fields:", { email, productId, variantId, storeDomain });
    return res.status(400).json({ ok: false, message: 'Missing required fields' });
  }
  const accessToken = getStoreToken(storeDomain);
  if (!accessToken) {
    return res.status(400).json({ ok: false, message: 'Store access token not found' });
  }
  const alreadyExists = data.find(entry =>
    entry.email === email &&
    entry.productId === productId &&
    entry.variantId === variantId &&
    entry.notified === false &&
    entry.storeDomain === storeDomain
  );

  if (alreadyExists) {
    return res.status(200).json({
      ok: false,
      message: "You’ve already requested a notification for this product."
    });
  }
  try {
    const { inventoryItemId, variantTitle } = await getInventoryItemId(storeDomain, accessToken, variantId);
    const entry = {
      name, email, productId, variantId, inventoryItemId, variantTitle,
      productTitle, productImage, productHandle,
      notified: false, storeDomain
    };

    data.push(entry);
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

    console.log("Notification request saved:", entry);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error getting inventory item ID:", err);
    res.status(500).json({ ok: false, message: "Failed to retrieve inventory item ID" });
  }
});


// Optional: simulate stock update and send emails
app.post('/api/stock-update', async (req, res) => {
  const update = req.body;
  console.log("Webhook Called, data:", update);

  const inventoryItemId = String(update.inventory_item_id);
  const newQuantity = update.available;

  if (newQuantity < 1) {
    return res.json({ ok: true, message: 'Inventory not in stock.' });
  }

  // Filter entries waiting for this inventory item
  const matchingSubscribers = data.filter(entry =>
    entry.variantId && !entry.notified && String(entry.inventoryItemId) === inventoryItemId
  );

  if (matchingSubscribers.length === 0) {
    console.log("No matching subscribers for inventory_item_id:", inventoryItemId);
    return res.json({ ok: true, message: 'No matching subscribers.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  let notifiedCount = 0;

  for (const subscriber of matchingSubscribers) {
    const productUrl = `https://${subscriber.storeDomain}/products/${subscriber.productHandle}?variant=${subscriber.variantId}`;

    const htmlContent = `
    <div style="font-family: 'Roboto', Arial, sans-serif; color: #2b2b2b; padding: 24px; max-width: 600px; margin: auto; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #1a1a1a; font-size: 22px; margin-bottom: 8px;">${subscriber.productTitle || 'Product'} is Back in Stock!</h2>
      <p style="font-size: 16px;">Hi ${subscriber.name || 'Customer'},</p>
      <p style="font-size: 16px; margin-top: 0;">Good news! The Product${subscriber.variantTitle ? " variant <strong>" + subscriber.variantTitle + "</strong>" : ''} you were waiting for is now available again.</p>

      ${subscriber.productImage ? `
        <div style="text-align: center; margin: 20px 0;">
          <img src="https:${subscriber.productImage}" alt="${subscriber.productTitle}" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);" />
        </div>` : ''}

      <div style="text-align: center; margin: 25px 0;">
        <a href="${productUrl}" 
          style="background: #007bff; color: white; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 6px; display: inline-block; box-shadow: 0 2px 4px rgba(0, 123, 255, 0.4);">
          View Product
        </a>
      </div>

      <p style="font-size: 14px; color: #777; text-align: right;">Thank you for your interest!<br/>– Your Shopify Store Team</p>
    </div>
    `;

    try {
      await transporter.sendMail({
        from: `"Shopify Store" <${process.env.EMAIL_USER}>`,
        to: subscriber.email,
        subject: `${subscriber.productTitle || 'Product'} is back in stock!`,
        html: htmlContent
      });
      subscriber.notified = true;
      notifiedCount++;
      console.log(`Email sent to: ${subscriber.email}`);
    } catch (err) {
      console.error(`Failed to send email to ${subscriber.email}:`, err);
    }
  }

  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  res.json({ ok: true, notified: notifiedCount });
});
app.post('/installed-update', (req, res) => {
  const { shop, accessToken } = req.body;

  let stores = loadStores();
  const existingStoreIndex = stores.findIndex((s) => s.shop === shop);
  const timestamp = new Date().toISOString();

  if (existingStoreIndex !== -1) {
    // Update existing store
    stores[existingStoreIndex].accessToken = accessToken;
    stores[existingStoreIndex].updatedAt = timestamp;
    console.log(`🔄 Updated store: ${shop}`);
  } else {
    // Add new store
    stores.push({
      shop,
      accessToken,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    console.log(`✅ Added new store: ${shop}`);
  }

  saveStores(stores);

  res.status(200).send("Store saved/updated");
});

app.post('/webhook', (req, res) => {
  console.log('Received GitHub webhook push event for front-end');

  const deploy = spawn('/var/www/html/deploy.sh');

  deploy.stdout.on('data', (data) => {
    console.log(`${data.toString()}`);
  });

  deploy.stderr.on('data', (data) => {
    console.log(`${data.toString()}`);
  });

  deploy.on('close', (code) => {
    console.log(`Deployment process exited with code ${code}`);
    res.status(200).send('Deployment triggered');
  });
});
 
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected successfullly.');
})
 
module.exports = mongoose;
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/apps.plestarinc.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/apps.plestarinc.com/fullchain.pem'),
};
https.createServer(options, app).listen(PORT, () => {
  console.log('Server running on port 7000');
});
