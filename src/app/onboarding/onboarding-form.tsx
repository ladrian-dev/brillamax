"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenantAction,
  initialOnboardingState,
} from "@/features/onboarding/actions";
import { slugify } from "@/features/onboarding/schema";

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(
    createTenantAction,
    initialOnboardingState,
  );
  // Slug auto-derivado mientras el usuario no lo edite manualmente.
  const [name, setName] = useState(state.values?.name ?? "");
  const [slug, setSlug] = useState(state.values?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(state.values?.slug));

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-xl border bg-card p-6 shadow-sm"
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="name">Nombre de la empresa</Label>
        <Input
          id="name"
          name="name"
          type="text"
          placeholder="Brillamax CA"
          required
          disabled={pending}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Identificador</Label>
        <Input
          id="slug"
          name="slug"
          type="text"
          placeholder="brillamax"
          required
          disabled={pending}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className="h-12 font-mono text-base"
          pattern="[a-z0-9-]{3,40}"
        />
        <p className="text-xs text-muted-foreground">
          Minúsculas, números y guiones. Se usa internamente.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="warehouseName">Nombre del almacén principal</Label>
        <Input
          id="warehouseName"
          name="warehouseName"
          type="text"
          defaultValue={state.values?.warehouseName ?? "Almacén principal"}
          required
          disabled={pending}
          className="h-12 text-base"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? "Creando…" : "Crear fábrica"}
      </Button>
    </form>
  );
}
