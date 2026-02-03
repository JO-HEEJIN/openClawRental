import { CREDIT_PACKAGES } from "./constants";

export function isValidPackageCode(code: string): boolean {
  return code in CREDIT_PACKAGES;
}

export function isValidUlid(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function sanitizeString(input: string, maxLength = 255): string {
  return input.trim().slice(0, maxLength);
}
