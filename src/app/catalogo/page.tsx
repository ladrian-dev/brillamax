import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listCustomers,
  listProducts,
  listRawMaterials,
  listSuppliers,
  listUoms,
} from "@/features/catalog/actions";
import { ProductSection } from "./product-section";
import { RawMaterialSection } from "./raw-material-section";
import { CustomerSection } from "./customer-section";
import { SupplierSection } from "./supplier-section";

export const metadata = {
  title: "Catálogo · Brillamax",
};

export default async function CatalogoPage() {
  const [products, rawMaterials, customers, suppliers, uoms] =
    await Promise.all([
      listProducts(),
      listRawMaterials(),
      listCustomers(),
      listSuppliers(),
      listUoms(),
    ]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 bg-background px-5 py-8 text-foreground">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
          <p className="text-sm text-muted-foreground">
            Productos, materias primas, clientes y proveedores.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" size="sm">
            Volver
          </Button>
        </Link>
      </header>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="raw-materials">Materias</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductSection items={products} />
        </TabsContent>
        <TabsContent value="raw-materials">
          <RawMaterialSection
            items={rawMaterials}
            uoms={uoms}
            suppliers={suppliers}
          />
        </TabsContent>
        <TabsContent value="customers">
          <CustomerSection items={customers} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SupplierSection items={suppliers} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
