-- ============================================================
-- RIALO BLOCKCHAIN EXPLORER — SUPABASE DATABASE SCHEMA
-- Run this script in your Supabase Project: SQL Editor -> New query
-- ============================================================

-- 1. Create Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    signature TEXT PRIMARY KEY,
    block_height BIGINT NOT NULL,
    block_time BIGINT,
    from_address TEXT,
    to_address TEXT,
    fee BIGINT,
    status TEXT DEFAULT 'success',
    instruction_count INT DEFAULT 0,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Indexes for fast querying & pagination
CREATE INDEX IF NOT EXISTS idx_tx_block_height ON public.transactions (block_height DESC);
CREATE INDEX IF NOT EXISTS idx_tx_block_time ON public.transactions (block_time DESC);
CREATE INDEX IF NOT EXISTS idx_tx_from_address ON public.transactions (from_address);
CREATE INDEX IF NOT EXISTS idx_tx_to_address ON public.transactions (to_address);

-- 2. Create Account Transactions Junction Table (for instant wallet history)
CREATE TABLE IF NOT EXISTS public.account_transactions (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL,
    signature TEXT NOT NULL REFERENCES public.transactions(signature) ON DELETE CASCADE,
    block_height BIGINT NOT NULL,
    block_time BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(address, signature)
);

CREATE INDEX IF NOT EXISTS idx_acct_tx_address ON public.account_transactions (address, block_height DESC);

-- 3. Create Indexer Sync Tracker Table (with Distributed Lock & Stats)
CREATE TABLE IF NOT EXISTS public.indexer_state (
    id TEXT PRIMARY KEY DEFAULT 'main_crawler',
    last_scanned_block BIGINT DEFAULT 0,
    total_indexed_transactions BIGINT DEFAULT 0,
    is_syncing BOOLEAN DEFAULT FALSE,
    sync_locked_until TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure lock columns exist if upgrading from earlier schema
ALTER TABLE public.indexer_state ADD COLUMN IF NOT EXISTS is_syncing BOOLEAN DEFAULT FALSE;
ALTER TABLE public.indexer_state ADD COLUMN IF NOT EXISTS sync_locked_until TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.indexer_state ADD COLUMN IF NOT EXISTS total_indexed_transactions BIGINT DEFAULT 0;

-- Insert default indexer state if not exists
INSERT INTO public.indexer_state (id, last_scanned_block, total_indexed_transactions, is_syncing, sync_locked_until)
VALUES ('main_crawler', 0, 0, FALSE, NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Enable Row Level Security (RLS) & Allow Public Read Access
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexer_state ENABLE ROW LEVEL SECURITY;

-- Clean up any legacy anon write policies (SECURITY HARDENING)
DROP POLICY IF EXISTS "Allow anon insert on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow anon update on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow anon insert on account_transactions" ON public.account_transactions;
DROP POLICY IF EXISTS "Allow anon insert on indexer_state" ON public.indexer_state;
DROP POLICY IF EXISTS "Allow anon all on indexer_state" ON public.indexer_state;
DROP POLICY IF EXISTS "Allow public read on transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow public read on account_transactions" ON public.account_transactions;
DROP POLICY IF EXISTS "Allow public read on indexer_state" ON public.indexer_state;

-- Allow anyone to read data (Explorer Frontend using public anon key)
CREATE POLICY "Allow public read on transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read on account_transactions" ON public.account_transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read on indexer_state" ON public.indexer_state FOR SELECT USING (true);

-- NOTE: All INSERT/UPDATE/DELETE operations MUST be executed via Backend Workers / GitHub Actions
-- using the Supabase Service Role Key (which automatically bypasses RLS).
-- No public write policies are permitted for security and data integrity.

-- 5. Helper Functions for Atomic Distributed Lock (Strictly Protected for service_role Only)
CREATE OR REPLACE FUNCTION public.acquire_sync_lock(lock_seconds INT DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    acquired BOOLEAN := FALSE;
BEGIN
    UPDATE public.indexer_state
    SET 
        sync_locked_until = NOW() + (lock_seconds || ' seconds')::INTERVAL,
        is_syncing = TRUE,
        updated_at = NOW()
    WHERE id = 'main_crawler'
      AND (sync_locked_until IS NULL OR sync_locked_until < NOW());
      
    IF FOUND THEN
        acquired := TRUE;
    END IF;
    
    RETURN acquired;
END;
$$;

-- Restrict function execution: Only backend service_role is allowed to call lock functions
REVOKE EXECUTE ON FUNCTION public.acquire_sync_lock(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_sync_lock(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.renew_sync_lock(lock_seconds INT DEFAULT 300)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.indexer_state
    SET 
        sync_locked_until = NOW() + (lock_seconds || ' seconds')::INTERVAL,
        is_syncing = TRUE,
        updated_at = NOW()
    WHERE id = 'main_crawler';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.renew_sync_lock(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_sync_lock(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.release_sync_lock(new_last_scanned BIGINT DEFAULT NULL, tx_increment BIGINT DEFAULT 0)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.indexer_state
    SET 
        last_scanned_block = COALESCE(new_last_scanned, last_scanned_block),
        total_indexed_transactions = total_indexed_transactions + GREATEST(0, tx_increment),
        is_syncing = FALSE,
        sync_locked_until = NOW(),
        updated_at = NOW()
    WHERE id = 'main_crawler';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_sync_lock(BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(BIGINT, BIGINT) TO service_role;

-- ============================================================
-- OPTIONAL: RESET / AUDIT DATABASE (Clear potentially tampered test data)
-- Uncomment and run if anon write was previously active and you want a fresh start:
--
-- TRUNCATE TABLE public.account_transactions CASCADE;
-- TRUNCATE TABLE public.transactions CASCADE;
-- UPDATE public.indexer_state SET last_scanned_block = 0, total_indexed_transactions = 0, is_syncing = false, sync_locked_until = NOW() WHERE id = 'main_crawler';
-- ============================================================
