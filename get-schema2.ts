import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data, error } = await supabase.from('coaching_sessions').select('*').limit(1);
  console.log("Coaching Sessions:", data, error);
}
main();
