const maxAmountCents = 999_999_999;
const expenseCategories = [
  "transport",
  "accommodation",
  "food",
  "activities",
  "other",
] as const;

export function stringField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : undefined;
}

export function parseDate(value: unknown): string | null | undefined {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export function isExpenseCategory(value: unknown): value is typeof expenseCategories[number] {
  return typeof value === "string" && expenseCategories.includes(value as typeof expenseCategories[number]);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseAmountCents(value: unknown): number | undefined {
  const amountText = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  const match = /^(0|[1-9]\d{0,7})(?:\.(\d{1,2}))?$/.exec(amountText);
  if (!match) return undefined;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents >= 1 && cents <= maxAmountCents ? cents : undefined;
}

export function convertAmountCents(amountCents: number, rate: number): number {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    amountCents > maxAmountCents ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    throw new RangeError("Amount and exchange rate must be positive and in range.");
  }

  const convertedCents = Math.round(amountCents * rate);
  if (convertedCents < 1 || convertedCents > maxAmountCents) {
    throw new RangeError("The converted amount is outside the supported range.");
  }
  return convertedCents;
}

export function splitPerPersonCents(totalCents: number, travelers: number): number {
  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    !Number.isInteger(travelers) ||
    travelers < 1
  ) {
    throw new RangeError("Total must be nonnegative and traveler count must be positive.");
  }

  return Math.round(totalCents / travelers);
}
