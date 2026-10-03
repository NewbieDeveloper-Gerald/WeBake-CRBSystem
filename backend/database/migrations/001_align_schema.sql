-- ============================================================================
-- Migration 001: Align Schema for Server-Side Trust & Verification Tokens
-- Safe and idempotent: can be executed multiple times without side effects
-- ============================================================================

-- 1. Ensure saved_cart exists on users table for cloud cart sync
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS saved_cart JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Add verified_at to otp_verifications for 2-phase token verification (verify -> register/reset)
ALTER TABLE otp_verifications 
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 3. Add idempotency_key to orders to prevent duplicate submissions on network retries
ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) UNIQUE;

-- 4. Create index on idempotency_key if not already indexed
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);

-- 5. Add index on otp_verifications verified_at and consumed_at for fast lookup
CREATE INDEX IF NOT EXISTS idx_otp_verification_state 
    ON otp_verifications(email_address, purpose, verified_at, consumed_at, expires_at);
