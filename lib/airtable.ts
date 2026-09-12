const API = "https://api.airtable.com/v0";

export const BASE_ID = process.env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";

export const TABLES = {
  coverage: "tblcl1UAyMqZT6Ub0",
  picks: "tblg3J5sbJYbzuTYD"
} as const;

export type Rec<T> = {
  id: string;
  createdTime: string;
  fields: T;
};

export class AirtableError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "AirtableError";
    this.status = status;
  }
}

export async function records<T>(
  table: string,
  fields: string[],
  sort?: { field: string; direction: "asc" | "desc" }
): Promise<Rec<T>[]> {
  const token = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_ACCESS_TOKEN;

  if (!token) {
    throw new AirtableError("AIRTABLE_TOKEN is missing from the Vercel Production environment.");
  }

  const out: Rec<T>[] = [];
  let offset: string | undefined;

  do {
    const url = new URL(`${API}/${BASE_ID}/${table}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);

    if (sort) {
      url.searchParams.set("sort[0][field]", sort.field);
      url.searchParams.set("sort[0][direction]", sort.direction);
    }

    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AirtableError(
        `Airtable HTTP ${response.status}: ${text.slice(0, 500) || "request rejected"}`,
        response.status
      );
    }

    const payload = (await response.json()) as { records: Rec<T>[]; offset?: string };
    out.push(...payload.records);
    offset = payload.offset;
  } while (offset);

  return out;
}

export function selectName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name || "");
  }
  return "";
}
