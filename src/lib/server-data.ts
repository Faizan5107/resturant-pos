import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/relations";

interface CurrentProfile {
  full_name: string;
  role: string;
  restaurant_id: string | null;
  is_active: boolean;
  restaurants: {
    name: string;
    slug: string;
    logo_url: string | null;
    status: string;
  } | null;
}

type SettingsSelections = {
  currency: { currency: string };
  "currency, enable_donation, donation_percentage": {
    currency: string;
    enable_donation: boolean;
    donation_percentage: number;
  };
  "address, phone, slogan, currency, timezone, tax_rate, receipt_footer, paper_width, enable_donation, donation_percentage, enable_service_fee, service_fee_amount": {
    address: string | null;
    phone: string | null;
    slogan: string | null;
    currency: string;
    timezone: string;
    tax_rate: number;
    receipt_footer: string | null;
    paper_width: string | null;
    enable_donation: boolean;
    donation_percentage: number;
    enable_service_fee: boolean;
    service_fee_amount: number;
  };
};

const getCurrentProfile = async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  if (claimsError) throw claimsError;
  const claims = claimsData?.claims;
  if (!claims || typeof claims.sub !== "string") return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "full_name, role, restaurant_id, is_active, restaurants(name, slug, logo_url, status)"
    )
    .eq("id", claims.sub)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    ...data,
    restaurants: firstRelation(data.restaurants),
  };
};

export const getProfile = cache(getCurrentProfile);

const getSelectedSettings = async <Selection extends keyof SettingsSelections>(
  columns: Selection
): Promise<SettingsSelections[Selection] | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_settings")
      .select(columns)
      .maybeSingle();

    if (error) throw error;
    return data as SettingsSelections[Selection] | null;
};

export const getSettings = cache(getSelectedSettings);
