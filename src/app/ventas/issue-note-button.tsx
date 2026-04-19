"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  issueDeliveryNote,
  markDeliveryNoteShared,
} from "@/features/delivery-notes/actions";
import { initialDeliveryNoteState } from "@/features/delivery-notes/schema";

function waUrl(phone: string | null, text: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`;
}

export function IssueDeliveryNoteButton({
  saleId,
  saleNumber,
  customerName,
  customerPhone,
  totalUsd,
  totalVef,
  existing,
}: {
  saleId: string;
  saleNumber: string;
  customerName: string;
  customerPhone: string | null;
  totalUsd: number;
  totalVef: number;
  existing: {
    id: string;
    deliveryNumber: string;
    pdfVersion: number;
  } | null;
}) {
  const [open, setOpen] = useState(false);
  const [receivedBy, setReceivedBy] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    id?: string;
    deliveryNumber: string;
  } | null>(
    existing
      ? { id: existing.id, deliveryNumber: existing.deliveryNumber }
      : null,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set(
      "payload",
      JSON.stringify({
        saleId,
        receivedByName: receivedBy.trim() || null,
        customerSignatureUrl: null,
      }),
    );
    startTransition(async () => {
      const res = await issueDeliveryNote(initialDeliveryNoteState, fd);
      if (res.ok && res.deliveryNumber) {
        setIssued({ deliveryNumber: res.deliveryNumber });
      } else {
        setError(res.error ?? "Error al emitir NE");
      }
    });
  }

  const share = issued
    ? waUrl(
        customerPhone,
        `Hola ${customerName}, te envío la nota de entrega ${issued.deliveryNumber} de tu pedido ${saleNumber}. Total $${totalUsd.toFixed(2)} (Bs ${totalVef.toFixed(2)}).`,
      )
    : null;

  function markShared() {
    if (!issued?.id) return;
    startTransition(async () => {
      await markDeliveryNoteShared(issued.id!);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={existing ? "outline" : "default"}>
          {existing ? `NE ${existing.deliveryNumber}` : "Emitir NE"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {issued
              ? `Nota de entrega ${issued.deliveryNumber}`
              : "Emitir nota de entrega"}
          </DialogTitle>
          <DialogDescription>
            {saleNumber} · {customerName} · ${totalUsd.toFixed(2)}
          </DialogDescription>
        </DialogHeader>
        {issued ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              NE emitida con correlativo{" "}
              <span className="font-mono">{issued.deliveryNumber}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              {share ? (
                <a
                  href={share}
                  target="_blank"
                  rel="noreferrer"
                  onClick={markShared}
                  className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Compartir por WhatsApp
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Cliente sin teléfono — copia el número y comparte manual.
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  setIssued(
                    existing
                      ? {
                          id: existing.id,
                          deliveryNumber: existing.deliveryNumber,
                        }
                      : null,
                  );
                }}
              >
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="receivedBy">Recibido por (opcional)</Label>
              <Input
                id="receivedBy"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Nombre de quien recibe"
                disabled={pending}
                maxLength={120}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Emitiendo…" : "Emitir NE"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
