// Server-only. Sends a best-effort email to the counterparty when a chat message is sent.
// Failures are logged, never thrown — a missing/broken email provider must not block chat.
function getSiteUrl(): string | null {
  const explicit = process.env['SITE_URL'];
  if (explicit) return explicit.replace(/\/$/, '');
  const vercelUrl = process.env['VERCEL_URL'];
  return vercelUrl ? `https://${vercelUrl}` : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function notifyNewMessage(params: {
  tradeId: string;
  senderId: string;
  content: string | null;
}) {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: trade } = await supabaseAdmin
      .from('trades')
      .select('buyer_id, seller_id')
      .eq('id', params.tradeId)
      .maybeSingle();
    if (!trade) return;

    const recipientId = trade.buyer_id === params.senderId ? trade.seller_id : trade.buyer_id;
    if (!recipientId) return;

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, email_notifications')
      .in('id', [recipientId, params.senderId]);

    const recipient = profiles?.find((p) => p.id === recipientId);
    const sender = profiles?.find((p) => p.id === params.senderId);
    const senderName = sender?.display_name || 'Your trade counterparty';
    const preview = (params.content ?? '').trim() || 'Sent an attachment';

    const siteUrl = getSiteUrl();
    const tradeUrl = siteUrl ? `${siteUrl}/trades/${params.tradeId}` : null;

    if (recipient?.email && recipient.email_notifications !== false) {
      const { sendEmail } = await import('@/lib/email.server');
      await sendEmail({
        to: recipient.email,
        subject: `New message from ${senderName}`,
        html: `
          <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <p style="font-size: 15px; color: #111;">
              <strong>${escapeHtml(senderName)}</strong> sent you a message on your trade:
            </p>
            <p style="font-size: 14px; color: #444; background: #f5f5f5; border-radius: 8px; padding: 12px 14px; white-space: pre-line;">
              ${escapeHtml(preview).slice(0, 500)}
            </p>
            ${
              tradeUrl
                ? `<p style="margin-top: 20px;">
                    <a href="${tradeUrl}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; display: inline-block;">
                      Open the trade chat
                    </a>
                  </p>`
                : ''
            }
            <p style="font-size: 12px; color: #999; margin-top: 24px;">
              You're receiving this because you have an open trade on CEMP.
            </p>
          </div>
        `,
      });
    }

    if (recipientId) {
      const { sendPushToUser } = await import('@/lib/push.server');
      await sendPushToUser(recipientId, {
        title: `New message from ${senderName}`,
        body: preview.slice(0, 140),
        ...(tradeUrl ? { url: `/trades/${params.tradeId}` } : {}),
      });
    }
  } catch (err) {
    console.error('[notify] Failed to send new-message notification', err);
  }
}
