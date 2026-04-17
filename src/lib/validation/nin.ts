import { appConfig } from "@/config/app";

const NIN_REGEX = /^\d{11}$/;

/** Format gate per NIMC: exactly 11 digits, numeric. */
export function isValidNinFormat(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length !== appConfig.nin.length) return false;
  return NIN_REGEX.test(trimmed);
}
