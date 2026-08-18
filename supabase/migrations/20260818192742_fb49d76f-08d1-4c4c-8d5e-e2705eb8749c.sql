INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles WHERE email = 'buyer5316@example.com'
ON CONFLICT DO NOTHING;

-- demo dispute for admin resolution testing
INSERT INTO public.disputes (trade_id, raised_by, reason)
SELECT t.id, t.buyer_id, 'Seller has not responded after I sent payment via Wise, reference 8842.'
FROM public.trades t WHERE t.status = 'payment_claimed'
AND NOT EXISTS (SELECT 1 FROM public.disputes d WHERE d.trade_id = t.id);

UPDATE public.trades SET status = 'disputed' WHERE status = 'payment_claimed';