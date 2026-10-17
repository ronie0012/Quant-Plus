/**
 * Typed repositories for the workspace book. Every call goes through the
 * server's validated boundary; there is no generic client-side table access.
 */
import { workspaceAuthorization } from "./workspace-session";

export type Page<T> = { rows: T[]; total: number; offset: number; limit: number };
type Filter = [string, unknown] | [string, unknown, "eq" | "in" | "ilike" | "gte" | "lte"];

export async function workspaceCall<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/local", {
    method: "POST",
    headers: {
      Authorization: await workspaceAuthorization("Sign in to access your workspace"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  return (await response.json()) as T;
}

export function selectRows<T>(
  table: string,
  options: {
    filters?: Filter[];
    order?: { field: string; ascending?: boolean };
    limit?: number;
    offset?: number;
  } = {},
) {
  return workspaceCall<T[]>({
    table,
    operation: "select",
    filters: options.filters ?? [],
    ...(options.order
      ? { sorting: { field: options.order.field, ascending: options.order.ascending !== false } }
      : {}),
    ...(options.limit != null ? { limit: options.limit } : {}),
    ...(options.offset != null ? { offset: options.offset } : {}),
  });
}

export function selectPage<T>(
  table: string,
  options: {
    filters?: Filter[];
    order?: { field: string; ascending?: boolean };
    limit: number;
    offset: number;
  },
) {
  return workspaceCall<Page<T>>({
    table,
    operation: "select",
    count: true,
    filters: options.filters ?? [],
    ...(options.order
      ? { sorting: { field: options.order.field, ascending: options.order.ascending !== false } }
      : {}),
    limit: options.limit,
    offset: options.offset,
  });
}

export function selectOne<T>(table: string, filters: Filter[] = []) {
  return workspaceCall<T | null>({ table, operation: "select", filters, singular: true });
}

export function insertRow<T>(table: string, values: Record<string, unknown>) {
  return workspaceCall<T | null>({ table, operation: "insert", values, singular: true });
}

export function updateRows(table: string, values: Record<string, unknown>, filters: Filter[]) {
  return workspaceCall<unknown[]>({ table, operation: "update", values, filters });
}

export function upsertRow<T>(table: string, values: Record<string, unknown>) {
  return workspaceCall<T | null>({ table, operation: "upsert", values, singular: true });
}

export function deleteRows(table: string, filters: Filter[]) {
  if (!filters.length) throw new Error("Refusing to delete without a filter");
  return workspaceCall<unknown[]>({ table, operation: "delete", filters });
}

export function workspaceRpc<T>(rpc: string, values: Record<string, unknown> = {}) {
  return workspaceCall<T>({ rpc, values });
}

/** Queries against the separate closed-session practice book. */
export function practiceCall<T>(body: Record<string, unknown>) {
  return workspaceCall<T>({ ...body, book: "practice" });
}
