import { describe, expect, it } from "vitest";
import { flashMessage, isFlashKey, withFlash } from "@/lib/ui/flash";

describe("withFlash", () => {
  it("adauga cheia pe o cale simpla", () => {
    expect(withFlash("/admin/products", "product-created")).toBe(
      "/admin/products?flash=product-created",
    );
  });

  it("pastreaza parametrii existenti", () => {
    expect(withFlash("/products?category=audio&page=2", "signed-in")).toBe(
      "/products?category=audio&page=2&flash=signed-in",
    );
  });

  it("suprascrie un flash deja prezent, fara sa il dubleze", () => {
    expect(withFlash("/cart?flash=signed-in", "cart-item-removed")).toBe(
      "/cart?flash=cart-item-removed",
    );
  });

  it("reduce o adresa absoluta la cale interna (fara redirect in afara)", () => {
    expect(withFlash("https://evil.example/pwn", "signed-in")).toBe(
      "/pwn?flash=signed-in",
    );
  });
});

describe("isFlashKey", () => {
  it("accepta doar chei din registru", () => {
    expect(isFlashKey("signed-out")).toBe(true);
    expect(isFlashKey("<script>")).toBe(false);
    expect(isFlashKey(undefined)).toBe(false);
  });

  it("fiecare cheie are mesaj si ton valid", () => {
    for (const key of ["signed-in", "signed-out", "cart-item-removed"] as const) {
      const flash = flashMessage(key);
      expect(flash.message.length).toBeGreaterThan(0);
      expect(["success", "info", "error"]).toContain(flash.tone);
    }
  });
});
