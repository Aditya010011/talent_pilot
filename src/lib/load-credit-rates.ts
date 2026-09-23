import {
  DEFAULT_CREDIT_RATES,
  mergeCreditRates,
  type CreditRates,
} from "@/lib/interview-credits";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Load system-wide interview credit rates. Missing table / empty rows /
 * invalid values fall back to 5 credits per 15 minutes (Chat stays 0).
 */
export async function loadCreditRates(): Promise<CreditRates> {
  try {
    const { data, error } = await supabaseAdmin
      .from("credit_rates")
      .select("interviewType, credits, minutes");
    if (error || !data) return { ...DEFAULT_CREDIT_RATES };
    return mergeCreditRates(data);
  } catch {
    return { ...DEFAULT_CREDIT_RATES };
  }
}
