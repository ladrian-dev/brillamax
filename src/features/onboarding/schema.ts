import { z } from "zod";

/**
 * Deriva un slug desde el nombre: minúsculas, a-z0-9-, 3–40 chars.
 * Coincide con el CHECK constraint de tenants.slug.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const createTenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nombre muy corto")
    .max(80, "Nombre muy largo"),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9-]{3,40}$/,
      "Solo minúsculas, números y guiones (3–40)",
    ),
  warehouseName: z
    .string()
    .trim()
    .min(2, "Nombre del almacén muy corto")
    .max(60, "Nombre del almacén muy largo"),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
