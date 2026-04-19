import { OnboardingForm } from "./onboarding-form";

export const metadata = {
  title: "Configurar tu fábrica · Brillamax",
};

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-6 py-12">
      <div className="mb-10 mt-4 text-center">
        <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-foreground">
          Paso 1 de 1
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
          Configura tu fábrica
        </h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Solo necesitamos el nombre y un identificador único para tu empresa.
          El resto lo completas después.
        </p>
      </div>
      <div className="w-full max-w-md">
        <OnboardingForm />
      </div>
    </main>
  );
}
