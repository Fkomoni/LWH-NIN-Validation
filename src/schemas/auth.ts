import { z } from "zod";
import { isIsoDate, isPlausibleDob } from "@/lib/validation/dob";
import { isValidNinFormat } from "@/lib/validation/nin";

/**
 * Leadway enrollee ID. Real Leadway format is numeric with a `/N` suffix
 * (e.g. "21000645/0" for the principal, "21000645/1" for a dependant).
 * Historical demo IDs like "LWH-0001" are still accepted so the Phase-1
 * walkthrough scenarios keep working.
 */
export const enrolleeIdSchema = z
  .string({ required_error: "Please enter your Enrollee ID." })
  .trim()
  .min(4, "Enrollee ID is too short.")
  .max(30, "Enrollee ID is too long.")
  .regex(
    /^[A-Za-z0-9/\-]+$/,
    "Enrollee ID may only contain letters, numbers, dashes and slashes.",
  );

export const dobSchema = z
  .string({ required_error: "Please enter your date of birth." })
  .refine(isIsoDate, "Please enter a valid date.")
  .refine((v) => isPlausibleDob(v, 0, 120), "That date doesn't look right.");

/**
 * Nigerian mobile number — accepts all common formats:
 *   08090700956  ·  8090700956  ·  2348090700956  ·  +2348090700956
 *   080 9070 0956 (spaces stripped before validation)
 */
export const phoneSchema = z
  .string({ required_error: "Please enter your phone number." })
  .trim()
  .transform((v) => v.replace(/[\s\-().]/g, ""))
  .refine(
    (v) => /^(\+?234[7-9][01]\d{8}|0[7-9][01]\d{8}|[7-9][01]\d{8})$/.test(v),
    "Please enter a valid Nigerian mobile number (e.g. 08090700956).",
  );

const consentField = z.literal(true, {
  errorMap: () => ({ message: "You must accept the consent notice to continue." }),
});

export const authStartSchema = z.object({
  enrolleeId: enrolleeIdSchema,
  dob: dobSchema,
  consent: consentField,
  turnstileToken: z.string().optional(),
});
export type AuthStartInput = z.infer<typeof authStartSchema>;

export const authStartPhoneSchema = z.object({
  phone: phoneSchema,
  dob: dobSchema,
  consent: consentField,
  turnstileToken: z.string().optional(),
});
export type AuthStartPhoneInput = z.infer<typeof authStartPhoneSchema>;

export const principalNinSchema = z.object({
  enrolleeId: enrolleeIdSchema,
  nin: z
    .string({ required_error: "Please enter your NIN." })
    .trim()
    .refine(isValidNinFormat, "NIN must be exactly 11 digits."),
  dob: dobSchema,
});
export type PrincipalNinInput = z.infer<typeof principalNinSchema>;
