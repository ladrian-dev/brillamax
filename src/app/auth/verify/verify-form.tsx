"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyOtp } from "@/features/auth/actions";
import { initialAuthState } from "@/features/auth/schema";

export function VerifyForm({ phone }: { phone: string }) {
  const [state, formAction, pending] = useActionState(verifyOtp, initialAuthState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="phone" value={phone} />
      <div className="space-y-2">
        <Label htmlFor="token">Código de 6 dígitos</Label>
        <Input
          id="token"
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="123456"
          required
          autoFocus
          disabled={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "token-error" : undefined}
          className="h-12 text-center text-2xl tracking-[0.5em] font-mono"
        />
        {state.error ? (
          <p id="token-error" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? "Verificando…" : "Entrar"}
      </Button>
    </form>
  );
}
