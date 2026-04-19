import { describe, expect, it } from "vitest";
import { createTenantSchema, slugify } from "./schema";

describe("slugify", () => {
  it("convierte nombre común", () => {
    expect(slugify("Brillamax CA")).toBe("brillamax-ca");
  });

  it("quita diacríticos", () => {
    expect(slugify("Limpieza Ñandú")).toBe("limpieza-nandu");
  });

  it("colapsa espacios y caracteres inválidos", () => {
    expect(slugify("  Jabón   & Cía — 2026!  ")).toBe("jabon-cia-2026");
  });

  it("recorta a 40 chars", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBe(40);
  });
});

describe("createTenantSchema", () => {
  it("acepta input válido", () => {
    const r = createTenantSchema.parse({
      name: "Brillamax CA",
      slug: "brillamax",
      warehouseName: "Almacén principal",
    });
    expect(r.slug).toBe("brillamax");
  });

  it("rechaza slug con mayúsculas o espacios", () => {
    expect(() =>
      createTenantSchema.parse({
        name: "X",
        slug: "Brillamax CA",
        warehouseName: "A",
      }),
    ).toThrow();
  });

  it("rechaza slug muy corto", () => {
    expect(() =>
      createTenantSchema.parse({
        name: "Brillamax",
        slug: "ab",
        warehouseName: "Almacén",
      }),
    ).toThrow();
  });
});
