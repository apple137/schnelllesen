import { createClient } from '@supabase/supabase-js'

// Der „publishable“-Schlüssel ist für den Browser gedacht und darf öffentlich sein;
// geschützt werden die Daten durch Row Level Security (siehe supabase/schema.sql).
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://szpyqfbkpljsssovhwbu.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_3CzWymyAmHXUt1r5mnwJzQ_OxmS6Wcu'

export const supabase = createClient(url, key)
