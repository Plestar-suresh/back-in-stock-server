const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const https = require('https');
const { spawn } = require('child_process');
require('dotenv').config();

 
const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());
app.use(bodyParser.json());

const FILE_PATH = __dirname + '/data.json';
 
// Load existing data or initialize empty
let data = [];
if (fs.existsSync(FILE_PATH)) {
  data = JSON.parse(fs.readFileSync(FILE_PATH));
}

app.post('/api/notify', (req, res) => {
  const { name, email, productId, variantId, storeDomain } = req.body;

  if (!email || !productId) {
    return res.status(400).json({ ok: false, message: 'Missing fields' });
  }

  const entry = { name, email, productId, variantId, notified: false, storeDomain };
  data.push(entry);
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

  console.log("Notification request saved:", entry);
  res.json({ ok: true });
});

// Optional: simulate stock update and send emails
app.post('/api/stock-update', async (req, res) => {
  const product = req.body;
  console.log("Webhook Called, data:", product);

  const productId = String(product.id);
  const productHandle = product.handle;
  const productTitle = product.title || 'Product';
  const productImage = product.image?.src || '';

  // Find back-in-stock variants
  const inStockVariants = (product.variants || []).filter(v => v.inventory_quantity > 0);
  if (inStockVariants.length === 0) {
    return res.json({ ok: true, message: 'No variants in stock.' });
  }

  let notifiedCount = 0;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  for (const variant of inStockVariants) {
    const variantId = String(variant.id);

    const matchingSubscribers = data.filter(entry =>
      entry.productId === productId &&
      entry.variantId === variantId &&
      !entry.notified
    );

    if (matchingSubscribers.length === 0) {
      console.log("No matching subscribers to notify for variant:", variantId);
      continue;
    }

    const productUrl = `https://${entry.storeDomain}/products/${product.handle}?variant=${entry.variantId}`;

    for (const subscriber of matchingSubscribers) {
      const htmlContent = `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; color: #333; padding: 20px; max-width: 600px; margin: auto; background: #ffffff; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2 style="color: #1a1a1a;">${productData.title} is Back in Stock!</h2>
      <p>Hi ${entry.name || 'Customer'},</p>
      <p>Good news! The product you were waiting for is now available again.</p>
      <div style="text-align: center; margin: 20px 0;">
        <img src="${productData.image?.src}" alt="${productData.title}" style="max-width: 100%; height: auto; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />
      </div>
      <div style="text-align: center; margin: 20px 0;">
        <a href="https://${productData.vendor}/products/${productData.handle}?variant=${entry.variantId}" 
           style="background: #007acc; color: white; text-decoration: none; padding: 12px 24px; font-size: 16px; border-radius: 5px; display: inline-block;">
          View Product
        </a>
      </div>
      <p style="font-size: 14px; color: #777;">Thank you for your interest!<br/>– Your Shopify Store Team</p>
    </div>
      `;

      try {
        await transporter.sendMail({
          from: `"Shopify Store" <${process.env.EMAIL_USER}>`,
          to: subscriber.email,
          subject: `${productTitle} is back in stock!`,
          html: htmlContent
        });
        subscriber.notified = true;
        console.log(`Email sent to: ${subscriber.email}`);
        notifiedCount++;
      } catch (err) {
        console.error(`Failed to send email to ${subscriber.email}:`, err);
      }
    }
  }
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  res.json({ ok: true, notified: notifiedCount });
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
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/apps.plestarinc.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/apps.plestarinc.com/fullchain.pem'),
};
https.createServer(options, app).listen(PORT, () => {
    console.log('Server running on port 7000');
});
