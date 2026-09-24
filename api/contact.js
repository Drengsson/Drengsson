// Vercel Serverless Function — handles the drengsson.is contact form and
// sends the message on via Resend's API.
//
// REQUIRED SETUP (do this in the Vercel dashboard, never in code):
//   1. Verify the drengsson.is sending domain in Resend (Resend dashboard ->
//      Domains -> Add Domain), which means adding a few DNS records at
//      ISNIC. Until that's verified, Resend will refuse to send from
//      contact@drengsson.is (or any @drengsson.is address).
//   2. Create an API key in Resend and add it to this Vercel project as an
//      environment variable named RESEND_API_KEY (Project Settings ->
//      Environment Variables). It must never be committed to the repo.
//
// Rate limiting below is a simple in-memory counter. It only holds state
// for the lifetime of one warm serverless instance — it resets on cold
// start and isn't shared across regions — so treat it as a cheap deterrent
// alongside the honeypot field, not real protection. If spam becomes a
// real problem, add Vercel Firewall rate-limit rules (dashboard, no code)
// or move this to an external store such as Upstash Redis.

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (hits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  hits.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

function stripTags(value) {
  return String(value == null ? '' : value)
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n]{3,}/g, '\n\n')
    .trim();
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 200 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const name = stripTags(body.name).slice(0, 100);
  const email = String(body.email == null ? '' : body.email).trim().slice(0, 200);
  const message = stripTags(body.message).slice(0, 5000);
  const company = String(body.company == null ? '' : body.company); // honeypot
  const lang = body.lang === 'en' ? 'en' : 'is';

  // Honeypot tripped: a bot filled in a field real visitors never see.
  // Pretend success so it doesn't learn to avoid this trap, but send nothing.
  if (company.trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  if (!name || !message || !isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'validation' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set in this Vercel environment');
    return res.status(500).json({ ok: false, error: 'server_error' });
  }

  const subject =
    lang === 'en'
      ? `New message from drengsson.is — ${name}`
      : `Ný skilaboð af drengsson.is — ${name}`;

  const textBody =
    `${lang === 'en' ? 'Name' : 'Nafn'}: ${name}\n` +
    `${lang === 'en' ? 'Email' : 'Netfang'}: ${email}\n\n` +
    `${message}`;

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Drengsson vefsíða <contact@drengsson.is>',
        to: ['drengsson@gmail.com'],
        reply_to: email,
        subject,
        text: textBody,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('Resend API error', resendRes.status, errText);
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact form send failed', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
