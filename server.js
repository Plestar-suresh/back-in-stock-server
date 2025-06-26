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
 console.log("Webhook Called, data:"+req.body);
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
