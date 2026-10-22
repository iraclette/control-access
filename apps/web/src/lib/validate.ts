const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_RE.test(value);
}

// A phone number as people type it: digits with optional +, spaces, dashes, dots or brackets.
export function isPhoneOrEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.includes("@")) return isValidEmail(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  return /^\+?[\d\s().-]+$/.test(trimmed) && digits.length >= 6 && digits.length <= 15;
}

export function isNonEmptyString(value: unknown, maxLen: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

export function isOptionalString(value: unknown, maxLen: number): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.length <= maxLen);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
