import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v));

export const issueDeliveryNoteSchema = z.object({
  saleId: z.string().uuid(),
  receivedByName: optionalText(120),
  customerSignatureUrl: optionalText(500),
});
export type IssueDeliveryNoteInput = z.infer<typeof issueDeliveryNoteSchema>;

export type DeliveryNoteActionState = {
  ok: boolean;
  error?: string;
  deliveryNumber?: string;
  pdfVersion?: number;
};

export const initialDeliveryNoteState: DeliveryNoteActionState = {
  ok: false,
};

export type DeliveryNoteRow = {
  id: string;
  saleId: string;
  deliveryNumber: string;
  issuedAt: string;
  pdfVersion: number;
  receivedByName: string | null;
  deliveredAt: string | null;
  sharedWhatsappAt: string | null;
};
