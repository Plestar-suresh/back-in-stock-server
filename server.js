const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const https = require('https');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config();
const PORT = process.env.PORT || 7000;

const app = express();
app.use(cors());


const { getCachedStoreToken, updateStoreTokenCache, updateStoreFrontTokenCache, getCachedStorefrontToken } = require('./cache');
const Store = require('./models/Store');
const { getCachedNotificationRequests, markNotifiedAndUpdateCache, getCachedSingleNotification, createNotificationAndCache } = require('./cache-notify');
const { default: axios } = require('axios');
const { default: authenticateShopifyWebhook } = require('./middleware/authenticate');
const { default: puppeteer } = require('puppeteer');

const webhookRouter = express.Router();
app.use(express.json());
webhookRouter.use(express.json());
webhookRouter.use(authenticateShopifyWebhook);

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-07';
async function getInventoryItemId(storeDomain, accessToken, variantId) {
  const url = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}/variants/${variantId}.json`;
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

webhookRouter.post('/api/notify', async (req, res) => {
  let data = req.body;

  const { name, email, productId, variantId, productTitle, productImage, productHandle, storeDomain, app: appName } = data;

  if (!email || !productId || !variantId || !storeDomain || !appName) {
    console.log("❌ Missing required fields:", { email, productId, variantId, storeDomain });
    return res.status(400).json({ ok: false, message: 'Missing required fields' });
  }
  const accessToken = await getCachedStoreToken(storeDomain, appName);
  if (!accessToken) {
    return res.status(400).json({ ok: false, message: 'Store access token not found' });
  }
  const alreadyExists = await getCachedSingleNotification(email, productId, variantId, storeDomain);


  if (alreadyExists) {
    return res.status(200).json({
      ok: false,
      message: "You’ve already requested a notification for this product."
    });
  }
  try {
    const { inventoryItemId, variantTitle } = await getInventoryItemId(storeDomain, accessToken, variantId);
    /*await NotificationRequest.create({
      name, email, productId, variantId, inventoryItemId, variantTitle,
      productTitle, productImage, productHandle,
      notified: false, storeDomain
    });*/
    const newRequest = await createNotificationAndCache({
      name, email, productId, variantId, inventoryItemId, variantTitle,
      productTitle, productImage, productHandle,
      notified: false, storeDomain
    });

    //data.push(entry);
    //fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

    //console.log("Notification request saved:", entry);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error getting inventory item ID:", err);
    res.status(500).json({ ok: false, message: "Failed to retrieve inventory item ID" });
  }
});


// Optional: simulate stock update and send emails
webhookRouter.post('/api/stock-update', async (req, res) => {
  let data = req.body; // already parsed object

  const update = data;
  //console.log("Webhook Called, data:", update);

  const inventoryItemId = String(update.inventory_item_id);
  const newQuantity = update.available;

  if (newQuantity < 1) {
    return res.json({ ok: true, message: 'Inventory not in stock.' });
  }

  // Filter entries waiting for this inventory item
  /*const matchingSubscribers = data.filter(entry =>
    entry.variantId && !entry.notified && String(entry.inventoryItemId) === inventoryItemId
  );*/
  //const matchingSubscribers = await NotificationRequest.find({ notified: true, inventoryItemId: inventoryItemId })
  const matchingSubscribers = await getCachedNotificationRequests(inventoryItemId);
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
      //await NotificationRequest.findByIdAndUpdate(subscriber._id, { notified: true }, { new: true });
      await markNotifiedAndUpdateCache(subscriber._id, inventoryItemId);
      notifiedCount++;
      console.log(`Email sent to: ${subscriber.email}`);
    } catch (err) {
      console.error(`Failed to send email to ${subscriber.email}:`, err);
    }
  }

  //fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  res.json({ ok: true, notified: notifiedCount });
});

webhookRouter.post('/api/search-products', async (req, res) => {
  let data = req.body; // already parsed object

  const { shop, userPrompt, app: appName } = data;

  if (!shop || !appName) {
    return res.status(400).json({ error: 'Missing shop or app in request body' });
  }
  if (!userPrompt) {
    return res.status(400).json({ error: 'Missing userPrompt in request body' });
  }

  try {
    const storefrontToken = await getStorefrontToken(shop, appName);
    if (!storefrontToken) {
      return res.status(401).json({ error: 'Unable to get storefront token' });
    }

    const graphqlQuery = await generateGraphQLQuery(userPrompt);
    const shopifyData = await runGraphQLOnShopify(shop, graphqlQuery, storefrontToken);

    res.json(shopifyData);
  } catch (err) {
    console.error("Full process error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function generateGraphQLQuery(userPrompt) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  try {
    const openAiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: "You're an assistant that converts user product requests into Shopify Storefront GraphQL queries. Return ONLY the complete GraphQL query with 'query { ... }'. Do NOT use triple backticks or code blocks. Use: products(first: 10, query: \"<user prompt>\"). Inside node, return: title, handle, availableForSale, featuredImage { url }, and priceRange { minVariantPrice { amount, currencyCode } }. Do NOT use product, productByHandle, or any arguments that don't exist. Keep it simple filter manually in code based on user prompt.",
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
    });

    const gqlQuery = openAiRes.data.choices[0].message.content.trim();
    return gqlQuery;
  } catch (error) {
    console.error("Error from OpenAI API:", error.response?.data || error.message);
    throw new Error("Failed to generate GraphQL query with AI.");
  }
}

async function runGraphQLOnShopify(shop, gqlQuery, storefrontToken) {
  if (!shop) throw new Error("Missing shop parameter");

  const shopifyRes = await axios.post(
    `https://${shop}/api/${SHOPIFY_API_VERSION}/graphql.json`,
    { query: gqlQuery },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
    }
  );

  return shopifyRes.data;
}

async function getStorefrontToken(shop, appName) {
  if (!shop || !appName) throw new Error('Missing shop or app');

  const accessToken = await getCachedStoreToken(shop, appName);
  if (!accessToken) throw new Error('Access token not found for this shop');

  let storefrontToken = await getCachedStorefrontToken(shop, appName);
  if (!storefrontToken) {
    const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    const query = `
            mutation StorefrontAccessTokenCreate($input: StorefrontAccessTokenInput!) {
                storefrontAccessTokenCreate(input: $input) {
                    userErrors { field message }
                    shop { id }
                    storefrontAccessToken {
                        accessScopes { handle }
                        accessToken
                        title
                    }
                }
            }
        `;
    const variables = { input: { title: "New Storefront Access Token" } };

    const response = await axios.post(url, { query, variables }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken.trim()
      }
    });

    const result = response.data.data?.storefrontAccessTokenCreate;
    if (result?.userErrors?.length) {
      throw new Error(`Storefront token creation failed: ${JSON.stringify(result.userErrors)}`);
    }

    storefrontToken = result?.storefrontAccessToken?.accessToken;
  }

  if (!storefrontToken) throw new Error('Failed to create or retrieve storefront access token');

  await updateStoreFrontTokenCache(shop, storefrontToken, appName);
  return storefrontToken;
}

webhookRouter.post('/api/installed-update', async (req, res) => {
  let data = req.body; // already parsed object
  
  const { shop, accessToken, app: appName } = data;
  console.log(`Install webhook for ${shop} - App: ${appName}`);
  //let stores = loadStores();
  //const existingStoreIndex = stores.findIndex((s) => s.shop === shop);
  const timestamp = new Date().toISOString();

  /*if (existingStoreIndex !== -1) {
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

  saveStores(stores);*/
  const updated = await Store.findOneAndUpdate(
    { shop, app: appName },
    {
      $set: { accessToken, updatedAt: timestamp, uninstall: false, app: appName },
      $setOnInsert: { createdAt: timestamp }
    },
    { upsert: true, new: true }
  );

  updateStoreTokenCache(shop, accessToken, appName);

  res.status(200).send("Store marked as installed");
});
webhookRouter.post('/api/uninstalled-update', async (req, res) => {
  let data = req.body; // already parsed object

  const { shop, app: appName } = data;

  console.log(`Uninstall webhook for ${shop} - App: ${appName}`);
  //const existingStoreIndex = stores.findIndex((s) => s.shop === shop);
  const timestamp = new Date().toISOString();

  /*if (existingStoreIndex !== -1) {
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

  saveStores(stores);*/
  const updated = await Store.findOneAndUpdate(
    { shop, app: appName },
    { updatedAt: timestamp, uninstall: true, accessToken: "" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  updateStoreTokenCache(shop, null, appName);

  res.status(200).send(`Store marked as uninstalled for app: ${appName}`);
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
app.get("/", async (req, res) => {
  /*const browser = await puppeteer.launch({headless: "new",  // run in headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  await page.setUserAgent("AI-Agent-Test");
  await page.goto("https://text-myshopitfy-com.myshopify.com/", { waitUntil: "networkidle2" });

  console.log("Page loaded, JavaScript executed.");
  await browser.close();*/
  res.json({ message: "GET request works" });
});
app.use(webhookRouter);



app.post('/api/fingerprint', async (req, res) => {
  let data = req.body; // already parsed object

  const { shop, fingerprint, visitorId } = data;
  console.log("Shop:" + shop + " Agent:" + fingerprint + " visitorId:" + visitorId);

});
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ MongoDB connected successfully.');
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});



module.exports = mongoose;
const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
};
https.createServer(options, app).listen(PORT, () => {
  console.log('Server running on port 7000');
});
