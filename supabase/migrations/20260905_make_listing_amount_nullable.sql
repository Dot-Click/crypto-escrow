-- `amount` is a legacy column from an earlier listings design — the create-offer
-- flow has used min_amount/max_amount for the trade range since well before this
-- session and never sets `amount`. It was still NOT NULL with no default, so
-- every offer insert failed with "null value in column amount violates not-null
-- constraint". Dropping the constraint rather than the column since dropping a
-- column needs more care about anything else that might reference it.
ALTER TABLE public.listings ALTER COLUMN amount DROP NOT NULL;
