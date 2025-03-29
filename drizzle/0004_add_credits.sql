-- Add credits field to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credits" integer DEFAULT 5; 