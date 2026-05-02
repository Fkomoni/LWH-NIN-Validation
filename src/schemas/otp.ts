import { z } from "zod";
import { appConfig } from "@/config/app";
import { enrolleeIdSchema } from "./auth";

export const otpRequestSchema = z.object({
  enrolleeId: enrolleeIdSchema,
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  enrolleeId: enrolleeIdSchema,
  code: z
    .string({ required_error: "Enter the 6-digit code." })
    .trim()
    .regex(new RegExp(`^\\d{${appConfig.otp.length}}$`), "OTP must be 6 digits."),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
