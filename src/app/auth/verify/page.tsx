import { redirect } from "next/navigation";
import { VerifyForm } from "./verify-form";

export const metadata = {
  title: "Verificar código · Brillamax",
};

type SearchParams = Promise<{ phone?: string }>;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { phone } = await searchParams;
  if (!phone) redirect("/auth/login");

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-card-foreground">
          Verificar código
        </h2>
        <p className="text-sm text-muted-foreground">
          Ingresa el código de 6 dígitos que enviamos a{" "}
          <span className="font-medium text-foreground">{phone}</span>.
        </p>
      </div>
      <VerifyForm phone={phone} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <a href="/auth/login" className="underline underline-offset-4">
          Usar otro teléfono
        </a>
      </p>
    </div>
  );
}
