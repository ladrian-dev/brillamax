export const metadata = {
  title: "Sin conexión · Brillamax",
};

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Sin conexión</h1>
      <p className="max-w-sm text-muted-foreground">
        Estás trabajando sin internet. Las ventas y operaciones que registres
        aquí se guardarán y se enviarán automáticamente cuando vuelvas a estar
        en línea.
      </p>
    </main>
  );
}
