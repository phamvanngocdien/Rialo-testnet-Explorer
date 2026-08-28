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

-- 3. Create Indexer Sync Tracker Table
CREATE TABLE IF NOT EXISTS public.indexer_state (
    id TEXT PRIMARY KEY DEFAULT 'main_crawler',
    last_scanned_block BIGINT DEFAULT 0,
    total_indexed_transactions BIGINT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default indexer state if not exists
INSERT INTO public.indexer_state (id, last_scanned_block, total_indexed_transactions)
VALUES ('main_crawler', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable Row Level Security (RLS) & Allow Public Read Access
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexer_state ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read data (Explorer Frontend)
CREATE POLICY "Allow public read on transactions" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read on account_transactions" ON public.account_transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read on indexer_state" ON public.indexer_state FOR SELECT USING (true);

-- Allow insert/upsert from anon key or authenticated service
CREATE POLICY "Allow anon insert on transactions" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update on transactions" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Allow anon insert on account_transactions" ON public.account_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon insert on indexer_state" ON public.indexer_state FOR ALL USING (true);
