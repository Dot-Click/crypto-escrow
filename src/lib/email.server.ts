// Minimal Resend wrapper. Server-only — never import from a route or *.functions.ts file directly.
export async function sendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY is not set — skipping email send');
    return;
  }

  const from = process.env['RESEND_FROM_EMAIL'] || 'EscrowP2P <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[email] Resend request failed (${res.status}): ${text}`);
  }
}
