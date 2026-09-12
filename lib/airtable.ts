const API = "https://api.airtable.com/v0";

export const BASE_ID = process.env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";

export const TABLES = {
  coverage: "tblcl1UAyMqZT6Ub0",
  picks: "tblg3J5sbJYbzuTYD",
  manualScores: "tblvsHegh2WZ8qor2"
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

function token() {
  const value = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_ACCESS_TOKEN;
  if (!value) {
    throw new AirtableError("AIRTABLE_TOKEN is missing from the Vercel Production environment.");
  }
  return value;
}

async function airtableFetch(url: URL, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AirtableError(
      `Airtable HTTP ${response.status}: ${text.slice(0, 500) || "request rejected"}`,
      response.status
    );
  }

  return response;
}

export async function records<T>(
  table: string,
  fields: string[],
  sort?: { field: string; direction: "asc" | "desc" }
): Promise<Rec<T>[]> {
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

    const response = await airtableFetch(url);
    const payload = (await response.json()) as { records: Rec<T>[]; offset?: string };
    out.push(...payload.records);
    offset = payload.offset;
  } while (offset);

  return out;
}

export async function createRecord<T = Record<string, unknown>>(
  table: string,
  fields: Record<string, unknown>
): Promise<Rec<T>> {
  const url = new URL(`${API}/${BASE_ID}/${table}`);
  const response = await airtableFetch(url, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] })
  });
  const payload = (await response.json()) as { records: Rec<T>[] };
  if (!payload.records?.[0]) throw new AirtableError("Airtable create returned no record.");
  return payload.records[0];
}

export async function updateRecord<T = Record<string, unknown>>(
  table: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<Rec<T>> {
  const url = new URL(`${API}/${BASE_ID}/${table}/${recordId}`);
  const response = await airtableFetch(url, {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });
  return response.json() as Promise<Rec<T>>;
}

export async function deleteRecord(table: string, recordId: string) {
  const url = new URL(`${API}/${BASE_ID}/${table}/${recordId}`);
  const response = await airtableFetch(url, { method: "DELETE" });
  return response.json();
}

export function selectName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name || "");
  }
  return "";
}
