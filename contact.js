// Vercel serverless function — handles the contact form on both language
// pages. Sends mail via Resend's HTTP API (no npm dependency required).
//
// Setup needed in the Vercel project (Settings → Environment Variables):
//   RESEND_API_KEY   — an API key from resend.com
//   CONTACT_FROM     — (optional) verified sender, e.g. "Drengsson <noreply@drengsson.is>"
//                       falls back to Resend's shared onboarding@resend.dev sender,
//                       which works without domain verification but is best replaced
//                       once drengsson.is is verified in Resend.
//   CONTACT_TO       — (optional) destination address, defaults to drengsson@gmail.com

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method-not-allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid-json' });
    }
  }

  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim();
  const company = String(body?.company || '').trim();
  const message = String(body?.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'missing-fields' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid-email' });
  }
  if (name.length > 200 || email.length > 200 || company.length > 200 || message.length > 5000) {
    return res.status(400).json({ ok: false, error: 'too-long' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Not configured yet — fail loudly server-side, gracefully client-side
    // (the site shows the "couldn't send, use the email address" message).
    console.error('contact form: RESEND_API_KEY is not set');
    return res.status(500).json({ ok: false, error: 'not-configured' });
  }

  const to = process.env.CONTACT_TO || 'drengsson@gmail.com';
  const from = process.env.CONTACT_FROM || 'Drengsson Website <onboarding@resend.dev>';

  const lines = [
    `Nafn / Name: ${name}`,
    `Netfang / Email: ${email}`,
    company ? `Fyrirtæki / Company: ${company}` : null,
    '',
    message,
  ].filter((l) => l !== null);

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `Nýtt verkefni frá ${name} — drengsson.is`,
        text: lines.join('\n'),
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text().catch(() => '');
      console.error('contact form: Resend error', resendRes.status, detail);
      return res.status(502).json({ ok: false, error: 'send-failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact form: unexpected error', err);
    return res.status(500).json({ ok: false, error: 'unexpected' });
  }
}
