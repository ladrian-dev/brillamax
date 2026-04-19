import { describe, expect, it } from "vitest";
import { loginSchema, normalizeVePhone, verifySchema } from "./schema";

describe("normalizeVePhone", () => {
  it("acepta formato local con 0 inicial", () => {
    expect(normalizeVePhone("04141234567")).toBe("+584141234567");
  });

  it("acepta formato sin prefijo", () => {
    expect(normalizeVePhone("4141234567")).toBe("+584141234567");
  });

  it("acepta formato completo E.164", () => {
    expect(normalizeVePhone("+58 414 123 4567")).toBe("+584141234567");
  });

  it("rechaza número que no empieza en 4", () => {
    expect(normalizeVePhone("02121234567")).toBeNull();
  });

  it("rechaza largo inválido", () => {
    expect(normalizeVePhone("414123")).toBeNull();
  });
});

describe("loginSchema", () => {
  it("normaliza al parsear", () => {
    const r = loginSchema.parse({ phone: "0414-123-4567" });
    expect(r.phone).toBe("+584141234567");
  });

  it("rechaza vacío", () => {
    expect(() => loginSchema.parse({ phone: "" })).toThrow();
  });
});

describe("verifySchema", () => {
  it("acepta código de 6 dígitos", () => {
    const r = verifySchema.parse({ phone: "4141234567", token: "123456" });
    expect(r.token).toBe("123456");
  });

  it("rechaza tokens con letras o largo incorrecto", () => {
    expect(() =>
      verifySchema.parse({ phone: "4141234567", token: "12345" }),
    ).toThrow();
    expect(() =>
      verifySchema.parse({ phone: "4141234567", token: "abcdef" }),
    ).toThrow();
  });
});
