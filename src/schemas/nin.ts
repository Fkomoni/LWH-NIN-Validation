import { z } from "zod";
import { isValidNinFormat } from "@/lib/validation/nin";

export const ninInputSchema = z
  .string({ required_error: "Please enter an NIN." })
  .trim()
  .refine(isValidNinFormat, "NIN must be exactly 11 digits.");

export const beneficiaryNinSubmitSchema = z.object({
  // F-13: cap so a malformed / oversized value can't pass through to
  // the in-memory household lookup. Real enrolleeIds are ~12 chars
  // (e.g. "21000645/15").
  beneficiaryId: z.string().min(1).max(40),
  nin: ninInputSchema,
  idempotencyKey: z.string().uuid().optional(),
});
export type BeneficiaryNinSubmitInput = z.infer<typeof beneficiaryNinSubmitSchema>;

export const householdSubmitSchema = z.object({
  submissions: z
    .array(beneficiaryNinSubmitSchema)
    .min(1, "Please enter at least one NIN before submitting."),
});
export type HouseholdSubmitInput = z.infer<typeof householdSubmitSchema>;
