INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'demo.admin@escrowp2p.test'
ON CONFLICT DO NOTHING;