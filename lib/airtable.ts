import "server-only";

// Thin Airtable REST client. Server-only: uses a Personal Access Token from env.
// Never import this into a client component.

const API = "https://api.airtable.com/v0";

// Canonical var is AIRTABLE_TOKEN (this repo's .env convention); AIRTABLE_API_KEY is a fallback.
export const AIRTABLE_KEY = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appJbrDG28mXRJgfA";

export function airtableConfigured(): boolean {
  return Boolean(AIRTABLE_KEY && AIRTABLE_BASE_ID);
}

export interface AirtableRecord<F = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: F;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${AIRTABLE_KEY}`,
    "Content-Type": "application/json",
  };
}

interface ListOpts {
  fields?: string[];
  filterByFormula?: string;
  sort?: { field: string; direction?: "asc" | "desc" }[];
  maxRecords?: number;
  pageSize?: number;
  // Next.js fetch cache control.
  revalidate?: number | false;
}

// List every record in a table, following pagination.
export async function listRecords<F = Record<string, unknown>>(
  table: string,
  opts: ListOpts = {}
): Promise<AirtableRecord<F>[]> {
  if (!airtableConfigured()) {
    throw new Error("Airtable is not configured (missing AIRTABLE_API_KEY / AIRTABLE_BASE_ID).");
  }
  const out: AirtableRecord<F>[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams();
    (opts.fields ?? []).forEach((f) => params.append("fields[]", f));
    if (opts.filterByFormula) params.set("filterByFormula", opts.filterByFormula);
    (opts.sort ?? []).forEach((s, i) => {
      params.append(`sort[${i}][field]`, s.field);
      if (s.direction) params.append(`sort[${i}][direction]`, s.direction);
    });
    if (opts.maxRecords) params.set("maxRecords", String(opts.maxRecords));
    params.set("pageSize", String(opts.pageSize ?? 100));
    if (offset) params.set("offset", offset);

    const url = `${API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`;
    const fetchInit: RequestInit & { next?: { revalidate: number } } = {
      headers: headers(),
    };
    if (opts.revalidate === false) {
      fetchInit.cache = "no-store";
    } else if (typeof opts.revalidate === "number") {
      fetchInit.next = { revalidate: opts.revalidate };
    }
    const res = await fetch(url, fetchInit);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable list ${table} failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { records: AirtableRecord<F>[]; offset?: string };
    out.push(...json.records);
    offset = json.offset;
  } while (offset);
  return out;
}

export async function createRecords<F = Record<string, unknown>>(
  table: string,
  records: { fields: Partial<F> }[]
): Promise<AirtableRecord<F>[]> {
  const created: AirtableRecord<F>[] = [];
  // Airtable accepts max 10 records per create call.
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ records: batch, typecast: true }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable create ${table} failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { records: AirtableRecord<F>[] };
    created.push(...json.records);
  }
  return created;
}

export async function updateRecords<F = Record<string, unknown>>(
  table: string,
  records: { id: string; fields: Partial<F> }[]
): Promise<AirtableRecord<F>[]> {
  const updated: AirtableRecord<F>[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ records: batch, typecast: true }),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable update ${table} failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { records: AirtableRecord<F>[] };
    updated.push(...json.records);
  }
  return updated;
}

export async function deleteRecords(table: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const params = new URLSearchParams();
    batch.forEach((id) => params.append("records[]", id));
    const res = await fetch(
      `${API}/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}?${params}`,
      { method: "DELETE", headers: headers(), cache: "no-store" }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable delete ${table} failed: ${res.status} ${body.slice(0, 300)}`);
    }
  }
}

// Table ids for the NNPHI base (stable across renames).
export const TABLES = {
  drivers: "tblZR59af1NuvIFV2",
  uncertainties: "tblKUDDCUuYexX0XV",
  scenarioUncertainties: "tblzqxc5plqJbtL6N",
  outcomes: "tblbUJE9HxNvtIqDL",
  loopImpacts: "tblqdBPTYjjEHUujK",
  loops: "tblpi7WizRFfjyVMu",
} as const;
