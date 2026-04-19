"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { emailLoginSchema, loginSchema, verifySchema } from "./schema";

export type AuthFormState = {
  ok: boolean;
  error?: string;
  info?: string;
  /** Valor echo para re-popular inputs tras error. */
  phone?: string;
  email?: string;
};

const INITIAL: AuthFormState = { ok: false };

/**
 * Pide OTP vía SMS. En dev local Supabase loggea el código en consola/Inbucket;
 * en prod debe haber un provider SMS configurado (Twilio, MessageBird, etc.).
 */
export async function requestOtp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Teléfono inválido",
      phone: String(formData.get("phone") ?? ""),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: parsed.data.phone,
  });
  if (error) {
    return { ok: false, error: error.message, phone: parsed.data.phone };
  }

  // Pasamos el teléfono como query param para el siguiente paso.
  redirect(`/auth/verify?phone=${encodeURIComponent(parsed.data.phone)}`);
}

/**
 * Verifica el código OTP. Tras éxito, Supabase establece la sesión en cookies
 * y el Auth Hook (custom_access_token_hook) inyecta `tenant_id` en el JWT.
 */
export async function verifyOtp(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = verifySchema.safeParse({
    phone: formData.get("phone"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      phone: String(formData.get("phone") ?? ""),
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: "sms",
  });
  if (error) {
    return { ok: false, error: error.message, phone: parsed.data.phone };
  }

  redirect("/");
}

/**
 * Fallback por email. Supabase envía un link con `?code=...` que el usuario
 * abre; el route handler /auth/callback intercambia el código por sesión.
 *
 * En local: los emails se capturan en Inbucket (http://127.0.0.1:54324).
 * En prod: requiere SMTP propio (Resend / SendGrid / SES) configurado en el
 * dashboard para no toparse con el rate limit de 4 emails/hora del emisor
 * interno de Supabase.
 */
export async function requestMagicLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = emailLoginSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Email inválido",
      email: String(formData.get("email") ?? ""),
    };
  }

  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ??
    `${hdrs.get("x-forwarded-proto") ?? "http"}://${hdrs.get("host") ?? "localhost:3000"}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) {
    return { ok: false, error: error.message, email: parsed.data.email };
  }

  return {
    ok: true,
    email: parsed.data.email,
    info: `Te enviamos un enlace a ${parsed.data.email}. Ábrelo desde el mismo dispositivo.`,
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export { INITIAL as initialAuthState };
