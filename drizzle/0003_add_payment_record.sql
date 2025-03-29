-- Create payment record table if it doesn't exist
CREATE TABLE IF NOT EXISTS "paymentRecord" (
    "id" serial PRIMARY KEY,
    "customerId" varchar,
    "sessionId" varchar
); 