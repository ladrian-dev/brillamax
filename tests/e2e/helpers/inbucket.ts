/**
 * Helper para leer magic links del servidor Inbucket local de Supabase.
 * En dev local, `supabase start` expone Inbucket en http://127.0.0.1:54324
 * capturando todos los emails salientes (magic links de auth).
 *
 * API v3 de Inbucket:
 *   GET /api/v1/mailbox/:name             → lista de mensajes
 *   GET /api/v1/mailbox/:name/:id          → detalle (header + body)
 *   DELETE /api/v1/mailbox/:name           → borrar todos (cleanup entre tests)
 */

const INBUCKET = process.env.INBUCKET_URL ?? "http://127.0.0.1:54324";

type InbucketMessage = {
  id: string;
  from: { text: string };
  subject: string;
  date: string;
  body: { text: string; html: string };
};

export function mailboxFromEmail(email: string): string {
  // Inbucket usa la parte local del email como nombre del buzón.
  return email.split("@")[0]!;
}

export async function listMailbox(email: string): Promise<InbucketMessage[]> {
  const res = await fetch(
    `${INBUCKET}/api/v1/mailbox/${mailboxFromEmail(email)}`,
  );
  if (!res.ok) return [];
  return (await res.json()) as InbucketMessage[];
}

export async function clearMailbox(email: string): Promise<void> {
  await fetch(`${INBUCKET}/api/v1/mailbox/${mailboxFromEmail(email)}`, {
    method: "DELETE",
  });
}

async function readMessage(
  email: string,
  id: string,
): Promise<InbucketMessage | null> {
  const res = await fetch(
    `${INBUCKET}/api/v1/mailbox/${mailboxFromEmail(email)}/${id}`,
  );
  if (!res.ok) return null;
  return (await res.json()) as InbucketMessage;
}

/**
 * Espera a que llegue un magic link para `email` y devuelve la URL de
 * confirmación embebida. Polls hasta `timeoutMs` (default 15s).
 */
export async function waitForMagicLink(
  email: string,
  timeoutMs = 15_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await listMailbox(email);
    const last = messages[messages.length - 1];
    if (last) {
      const msg = await readMessage(email, last.id);
      const body = msg?.body?.html ?? msg?.body?.text ?? "";
      // Supabase incluye el enlace como https://...auth/v1/verify?token=...&type=magiclink
      // o https://...auth/v1/verify?token=...&type=signup
      const match = body.match(/https?:\/\/\S*?auth\/v1\/verify\S*/);
      if (match) {
        return match[0].replace(/["'<>&]+$/, "");
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout esperando magic link para ${email}`);
}
