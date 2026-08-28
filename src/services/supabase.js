import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'YOUR_SUPABASE_URL' &&
  !supabaseUrl.includes('placeholder')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Save array of transaction objects to Supabase database with batch upsert
 * @param {Array<Object>} txs
 */
export async function syncTransactionsToSupabase(txs) {
  if (!isSupabaseConfigured || !supabase || !Array.isArray(txs) || txs.length === 0) return;

  try {
    const formattedTxs = txs.map(t => ({
      signature: t.signature,
      block_height: Number(t.blockHeight),
      block_time: t.blockTime ? Number(t.blockTime) : null,
      from_address: t.from || null,
      to_address: t.to || null,
      fee: typeof t.fee === 'number' ? t.fee : null,
      status: t.status || 'success',
      instruction_count: t.instructionCount || 0,
      raw_data: t
    })).filter(t => t.signature && !isNaN(t.block_height));

    if (formattedTxs.length === 0) return;

    // Upsert transactions into public.transactions
    const { error: txErr } = await supabase
      .from('transactions')
      .upsert(formattedTxs, { onConflict: 'signature', ignoreDuplicates: true });

    if (txErr) {
      console.warn('Supabase tx upsert warning:', txErr.message);
    }

    // Upsert account mappings into public.account_transactions
    const accountRows = [];
    for (const t of formattedTxs) {
      if (t.from_address && t.from_address.length >= 20) {
        accountRows.push({
          address: t.from_address,
          signature: t.signature,
          block_height: t.block_height,
          block_time: t.block_time
        });
      }
      if (t.to_address && t.to_address.length >= 20 && t.to_address !== t.from_address) {
        accountRows.push({
          address: t.to_address,
          signature: t.signature,
          block_height: t.block_height,
          block_time: t.block_time
        });
      }
    }

    if (accountRows.length > 0) {
      await supabase
        .from('account_transactions')
        .upsert(accountRows, { onConflict: 'address,signature', ignoreDuplicates: true })
        .catch(() => null);
    }
  } catch (err) {
    console.warn('Failed to sync to Supabase:', err);
  }
}

/**
 * Fetch paginated transactions from Supabase
 * @param {number} page - 0-indexed page number
 * @param {number} pageSize - number of items per page
 * @returns {Promise<{ transactions: Array, total: number }|null>}
 */
export async function fetchTransactionsFromSupabase(page = 0, pageSize = 50) {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .order('block_height', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const transactions = (data || []).map(row => ({
      signature: row.signature,
      blockHeight: row.block_height,
      blockTime: row.block_time,
      from: row.from_address,
      to: row.to_address,
      fee: row.fee,
      status: row.status,
      instructionCount: row.instruction_count
    }));

    return { transactions, total: count || 0 };
  } catch (err) {
    console.warn('Error querying Supabase transactions:', err);
    return null;
  }
}

/**
 * Fetch transaction history for a specific wallet address from Supabase
 * @param {string} address
 * @param {number} page
 * @param {number} pageSize
 * @returns {Promise<Array|null>}
 */
export async function fetchAccountTransactionsFromSupabase(address, page = 0, pageSize = 50) {
  if (!isSupabaseConfigured || !supabase || !address) return null;

  try {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from('account_transactions')
      .select('signature, block_height, block_time')
      .eq('address', address)
      .order('block_height', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return (data || []).map(row => ({
      signature: row.signature,
      blockHeight: row.block_height,
      blockTime: row.block_time,
      status: 'success'
    }));
  } catch (err) {
    console.warn('Error querying Supabase account transactions:', err);
    return null;
  }
}
