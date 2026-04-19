import { z } from "zod";

/**
 * Normaliza a formato E.164 venezolano: +58 + 10 dígitos empezando en 4.
 * Acepta entradas con prefijo, 0 inicial o sólo los 10 dígitos.
 *
 * Ejemplos válidos tras normalizar:
 *   +584141234567, 04141234567, 4141234567 → "+584141234567"
 */
export function normalizeVePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let local: string;
  if (digits.startsWith("58")) local = digits.slice(2);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else local = digits;
  if (local.length !== 10 || !local.startsWith("4")) return null;
  return `+58${local}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "Ingresa tu teléfono")
  .transform((val, ctx) => {
    const normalized = normalizeVePhone(val);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Teléfono venezolano inválido (+58 412/414/424/416/426)",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const loginSchema = z.object({
  phone: phoneSchema,
});

export const emailLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido"),
});

export const verifySchema = z.object({
  phone: phoneSchema,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "El código debe tener 6 dígitos"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;

/**
 * Estado del form de auth (OTP + magic link). Vive aquí, no en actions.ts,
 * porque Next.js 16 exige que los archivos "use server" solo exporten
 * funciones async — constantes de estado inicial deben vivir en módulos
 * del cliente o en schemas compartidos.
 */
export type AuthFormState = {
  ok: boolean;
  error?: string;
  info?: string;
  /** Valor echo para re-popular inputs tras error. */
  phone?: string;
  email?: string;
};

export const initialAuthState: AuthFormState = { ok: false };
