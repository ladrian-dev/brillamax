"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestOtp } from "@/features/auth/actions";
import { initialAuthState } from "@/features/auth/schema";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestOtp, initialAuthState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0414 123 4567"
          defaultValue={state.phone}
          required
          disabled={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "phone-error" : undefined}
          className="h-12 text-base"
        />
        {state.error ? (
          <p id="phone-error" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? "Enviando código…" : "Enviar código"}
      </Button>
    </form>
  );
}
