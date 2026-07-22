-- Add 'waiting_payment' to the status check constraint
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find the constraint name for the 'status' column check
    SELECT conname INTO r
    FROM pg_constraint
    WHERE conrelid = 'chegoja.rides'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%';

    IF r.conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE chegoja.rides DROP CONSTRAINT ' || r.conname;
    END IF;

    -- Add the new constraint with 'waiting_payment'
    ALTER TABLE chegoja.rides 
    ADD CONSTRAINT rides_status_check 
    CHECK (status IN ('searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment', 'finished', 'cancelled'));

END $$;
