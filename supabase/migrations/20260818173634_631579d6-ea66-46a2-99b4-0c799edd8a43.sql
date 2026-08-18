ALTER TABLE public.listings ADD CONSTRAINT listings_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.trades ADD CONSTRAINT trades_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.trades ADD CONSTRAINT trades_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.disputes ADD CONSTRAINT disputes_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.profiles(id) ON DELETE CASCADE;