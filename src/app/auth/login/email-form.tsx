"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  initialAuthState,
  requestMagicLink,
} from "@/features/auth/actions";

export function EmailForm() {
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    initialAuthState,
  );

  if (state.ok && state.info) {
    return (
      <div
        role="status"
        className="rounded-md border border-accent/40 bg-accent/10 p-4 text-sm text-foreground"
      >
        {state.info}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@correo.com"
          defaultValue={state.email}
          required
          disabled={pending}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
          className="h-12 text-base"
        />
        {state.error ? (
          <p id="email-error" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? "Enviando enlace…" : "Enviar enlace mágico"}
      </Button>
    </form>
  );
}
