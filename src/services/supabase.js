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
 * Fetch paginated transactions from Supabase using SQL range (Read-Only)
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
 * Fast O(1) query to fetch total indexed transaction count from indexer_state
 * @returns {Promise<number|null>}
 */
export async function fetchTotalTransactionCountFromSupabase() {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from('indexer_state')
      .select('total_indexed_transactions')
      .eq('id', 'main_crawler')
      .single();

    if (error) throw error;
    if (data && typeof data.total_indexed_transactions === 'number') {
      return data.total_indexed_transactions;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch transaction history for a specific wallet address from Supabase (Read-Only)
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
