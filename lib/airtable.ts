/** RETIRED: Airtable is historical read-only for Football v2.
 *
 * Active schedule/pick reads use the Google Sheets public-safe projection.
 * This module intentionally fails closed if stale code tries to restore an
 * Airtable dependency.
 */

export class AirtableError extends Error {
  status?: number;

  constructor(message = "AIRTABLE_RETIRED: Football v2 uses Google Sheets.", status = 410) {
    super(message);
    this.name = "AirtableError";
    this.status = status;
  }
}

export const BASE_ID = "RETIRED";
export const TABLES = {} as const;

export function selectName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name || "");
  }
  return "";
}

function retired(): never {
  throw new AirtableError();
}

export async function records<T>(): Promise<T[]> {
  return retired();
}

export async function createRecord<T>(): Promise<T> {
  return retired();
}

export async function updateRecord<T>(): Promise<T> {
  return retired();
}

export async function deleteRecord(): Promise<never> {
  return retired();
}
