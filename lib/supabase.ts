import { createClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
  }

  return value.replace(/\/rest\/v1\/?$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseUrlSecond = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL_second);
const supabaseAnonKeySecond = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_second;

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing');
}

if (!supabaseAnonKeySecond) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY_second is missing');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export const supabaseSecond = createClient(supabaseUrlSecond, supabaseAnonKeySecond, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
