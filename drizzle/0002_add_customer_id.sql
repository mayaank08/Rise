-- Add customerId column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'customerId'
    ) THEN
        ALTER TABLE users ADD COLUMN "customerId" varchar;
    END IF;
END $$; 