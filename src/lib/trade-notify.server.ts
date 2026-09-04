// Server-only. Emails both trade parties when a trade reaches a final state
// (released or cancelled). Best-effort — failures are logged, never thrown,
// so a broken/missing email provider can't block the underlying trade action.
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

function emailShell(bodyHtml: string, tradeUrl: string | null): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      ${bodyHtml}
      ${
        tradeUrl
          ? `<p style="margin-top: 20px;">
              <a href="${tradeUrl}" style="background: #111; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; display: inline-block;">
                View trade
              </a>
            </p>`
          : ''
      }
      <p style="font-size: 12px; color: #999; margin-top: 24px;">
        You're receiving this because you had a trade on CEMP.
      </p>
    </div>
  `;
}

export async function notifyTradeEnded(params: {
  tradeId: string;
  outcome: 'released' | 'cancelled';
}) {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: trade } = await supabaseAdmin
      .from('trades')
      .select('buyer_id, seller_id, crypto_type, amount, payout_amount, fiat_currency')
      .eq('id', params.tradeId)
      .maybeSingle();
    if (!trade) return;

    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, display_name, email_notifications')
      .in('id', [trade.buyer_id, trade.seller_id]);

    const buyer = profiles?.find((p) => p.id === trade.buyer_id);
    const seller = profiles?.find((p) => p.id === trade.seller_id);

    const siteUrl = getSiteUrl();
    const tradeUrl = siteUrl ? `${siteUrl}/trades/${params.tradeId}` : null;

    const { sendEmail } = await import('@/lib/email.server');

    const send = async (
      recipient: { email: string | null; display_name: string; email_notifications: boolean } | undefined,
      subject: string,
      bodyHtml: string,
    ) => {
      if (!recipient?.email || recipient.email_notifications === false) return;
      await sendEmail({ to: recipient.email, subject, html: emailShell(bodyHtml, tradeUrl) });
    };

    if (params.outcome === 'released') {
      await Promise.all([
        send(
          buyer,
          'Trade completed — funds released to your wallet',
          `<p style="font-size: 15px; color: #111;">Your trade is complete.</p>
           <p style="font-size: 14px; color: #444; background: #f5f5f5; border-radius: 8px; padding: 12px 14px;">
             You received <strong>${escapeHtml(String(trade.payout_amount))} ${escapeHtml(trade.crypto_type)}</strong> into your CEMP wallet.
           </p>`,
        ),
        send(
          seller,
          'Trade completed — escrow released',
          `<p style="font-size: 15px; color: #111;">Your trade is complete.</p>
           <p style="font-size: 14px; color: #444; background: #f5f5f5; border-radius: 8px; padding: 12px 14px;">
             You released <strong>${escapeHtml(String(trade.amount))} ${escapeHtml(trade.crypto_type)}</strong> from escrow to the buyer.
           </p>`,
        ),
      ]);
    } else {
      await Promise.all([
        send(
          buyer,
          'Trade cancelled',
          `<p style="font-size: 15px; color: #111;">Your trade was cancelled.</p>
           <p style="font-size: 14px; color: #444; background: #f5f5f5; border-radius: 8px; padding: 12px 14px;">
             No funds were exchanged — the seller's ${escapeHtml(String(trade.amount))} ${escapeHtml(trade.crypto_type)} escrow hold was released back to them.
           </p>`,
        ),
        send(
          seller,
          'Trade cancelled — escrow refunded',
          `<p style="font-size: 15px; color: #111;">Your trade was cancelled.</p>
           <p style="font-size: 14px; color: #444; background: #f5f5f5; border-radius: 8px; padding: 12px 14px;">
             Your <strong>${escapeHtml(String(trade.amount))} ${escapeHtml(trade.crypto_type)}</strong> escrow hold has been refunded to your available wallet balance.
           </p>`,
        ),
      ]);
    }
  } catch (err) {
    console.error('[notify] Failed to send trade-ended email', err);
  }
}
