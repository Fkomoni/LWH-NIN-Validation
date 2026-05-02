import { z } from "zod";
import { phoneSchema, dobSchema } from "./auth";
import { isValidNinFormat } from "@/lib/validation/nin";

export const quickStartSchema = z.object({
  phone: phoneSchema,
  consent: z.literal(true, {
    errorMap: () => ({ message: "You must accept the consent notice to continue." }),
  }),
});

export const quickOtpSchema = z.object({
  code: z
    .string({ required_error: "Please enter the 6-digit code." })
    .trim()
    .regex(/^\d{6}$/, "The code must be 6 digits."),
});

export const quickNinSchema = z.object({
  nin: z
    .string({ required_error: "Please enter your NIN." })
    .trim()
    .refine(isValidNinFormat, "NIN must be exactly 11 digits."),
  /** When the phone matched multiple profiles, the form posts the
   *  enrolleeIds the member ticked. Empty array = "all matches". */
  selectedIds: z.array(z.string()).optional(),
});

export const quickDobSchema = z.object({
  dob: dobSchema,
});
