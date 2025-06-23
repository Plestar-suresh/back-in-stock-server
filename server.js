const express = require('express');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

const FILE_PATH = __dirname + '/data.json';

// Load existing data or initialize empty
let data = [];
if (fs.existsSync(FILE_PATH)) {
  data = JSON.parse(fs.readFileSync(FILE_PATH));
}

app.post('/api/notify', (req, res) => {
  const { name, email, productId, variantId } = req.body;

  if (!email || !productId) {
    return res.status(400).json({ ok: false, message: 'Missing fields' });
  }

  const entry = { name, email, productId, variantId, notified: false };
  data.push(entry);
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));

  console.log("Notification request saved:", entry);
  res.json({ ok: true });
});

// Optional: simulate stock update and send emails
app.post('/api/stock-update', async (req, res) => {
  const { productId } = req.body;
  const entries = data.filter(entry => entry.productId === productId && !entry.notified);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  for (const entry of entries) {
    await transporter.sendMail({
      from: `"Shopify Store" <${process.env.EMAIL_USER}>`,
      to: entry.email,
      subject: 'Product is back in stock!',
      text: `Hi ${entry.name || 'Customer'}, the product you're interested in is back in stock!`
    });
    entry.notified = true;
  }

  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  res.json({ ok: true, notified: entries.length });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
