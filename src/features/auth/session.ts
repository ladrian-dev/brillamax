"use server";

import { createClient } from "@/lib/supabase/server";

export type SessionContext = {
  userId: string;
  tenantId: string;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) return null;
  return { userId: user.id, tenantId };
}
