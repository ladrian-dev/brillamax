import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "success" | "error";

type Props = {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  /** Callback opcional para un botón de cierre. Si se omite, no aparece. */
  onDismiss?: () => void;
  action?: React.ReactNode;
  className?: string;
};

const TONE_STYLES: Record<
  Tone,
  { container: string; icon: LucideIcon; iconColor: string }
> = {
  info: {
    container: "border-accent/40 bg-accent/10 text-foreground",
    icon: Info,
    iconColor: "text-accent",
  },
  warning: {
    container: "border-warning/40 bg-warning/10 text-warning-foreground",
    icon: AlertTriangle,
    iconColor: "text-warning",
  },
  success: {
    container: "border-success/40 bg-success/10 text-foreground",
    icon: CheckCircle2,
    iconColor: "text-success",
  },
  error: {
    container: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: AlertTriangle,
    iconColor: "text-destructive",
  },
};

/**
 * Banner inline para comunicar estados de sistema/dominio (stock bajo, tasa
 * desactualizada, deuda >30d). Distinto de <Toast>: el banner es persistente,
 * contextual y ocupa espacio en el layout.
 */
export function AlertBanner({
  tone = "info",
  title,
  children,
  onDismiss,
  action,
  className,
}: Props) {
  const { container, icon: Icon, iconColor } = TONE_STYLES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-sm",
        container,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-sm">{children}</div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
