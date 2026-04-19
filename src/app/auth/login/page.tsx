import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailForm } from "./email-form";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Iniciar sesión · Brillamax",
};

export default function LoginPage() {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-6 space-y-1">
        <h2 className="text-xl font-semibold text-card-foreground">
          Iniciar sesión
        </h2>
        <p className="text-sm text-muted-foreground">
          Usa tu teléfono o tu email — lo que tengas a mano.
        </p>
      </div>
      <Tabs defaultValue="phone" className="w-full">
        <TabsList className="mb-4 grid w-full grid-cols-2">
          <TabsTrigger value="phone">Teléfono</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
        </TabsList>
        <TabsContent value="phone">
          <LoginForm />
        </TabsContent>
        <TabsContent value="email">
          <EmailForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
