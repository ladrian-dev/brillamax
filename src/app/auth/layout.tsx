import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Brillamax
        </h1>
        <p className="text-sm text-muted-foreground">
          Gestión para tu microfábrica
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
