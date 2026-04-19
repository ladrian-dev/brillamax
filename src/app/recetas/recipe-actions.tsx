"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  activateRecipe,
  archiveRecipe,
  cloneRecipeAsVersion,
} from "@/features/recipes/actions";
import type { RecipeRow } from "@/features/recipes/schema";

/** Acciones por receta: activar (solo draft), archivar, clonar como nueva versión. */
export function RecipeCardActions({ recipe }: { recipe: RecipeRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Error");
    });
  }

  function handleActivate() {
    const makeDefault = window.confirm(
      "¿Marcar esta receta como default del producto? (Acepta = default, Cancela = activa sin default)",
    );
    run(() => activateRecipe(recipe.id, makeDefault));
  }

  function handleArchive() {
    if (!window.confirm(`Archivar receta ${recipe.name} ${recipe.version}?`)) return;
    run(() => archiveRecipe(recipe.id, "manual"));
  }

  function handleClone() {
    const next = window.prompt(
      `Versión para la nueva copia (actual: ${recipe.version})`,
      bumpVersion(recipe.version),
    );
    if (!next) return;
    run(() => cloneRecipeAsVersion(recipe.id, next.trim()));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recipe.status === "draft" ? (
        <Button
          type="button"
          size="sm"
          onClick={handleActivate}
          disabled={pending}
        >
          Activar
        </Button>
      ) : null}
      {recipe.status !== "archived" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClone}
          disabled={pending}
        >
          Nueva versión
        </Button>
      ) : null}
      {recipe.status !== "archived" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleArchive}
          disabled={pending}
        >
          Archivar
        </Button>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function bumpVersion(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)$/);
  if (!m) return `${v}.1`;
  return `${m[1]}.${Number(m[2]) + 1}`;
}
