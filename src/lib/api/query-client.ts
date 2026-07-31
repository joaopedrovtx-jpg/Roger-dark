"use client";

import { authedFetch } from "@/lib/client/session";
import type { ApiErrorBody } from "@/lib/domain/types";

/**
 * Helpers client-side para React Query.
 * Todos usam `authedFetch` (cookie httpOnly + impersonate header).
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  bugId?: string;

  constructor(status: number, body: ApiErrorBody, bugId?: string) {
    super(body.error || `HTTP ${status}`);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.bugId = bugId;
  }
}

async function parseBody(res: Response): Promise<{
  json: unknown;
  bugId?: string;
}> {
  let bugId: string | undefined;
  let json: unknown = null;
  try {
    const clone = res.clone();
    const text = await clone.text();
    if (text) {
      json = JSON.parse(text);
      if (
        json &&
        typeof json === "object" &&
        "bugId" in json
      ) {
        bugId = String((json as { bugId?: unknown }).bugId);
      }
    }
  } catch {
    /* ignore */
  }
  return { json, bugId };
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await authedFetch(path, { signal });
  const { json, bugId } = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (json as ApiErrorBody) || { error: res.statusText },
      bugId
    );
  }
  return json as T;
}

export async function apiSend<T, B = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: B,
  signal?: AbortSignal
): Promise<T> {
  const res = await authedFetch(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  const { json, bugId } = await parseBody(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (json as ApiErrorBody) || { error: res.statusText },
      bugId
    );
  }
  if (res.status === 204) return undefined as T;
  return (json as T) ?? (undefined as T);
}

export const apiPost = <T, B = unknown>(path: string, body?: B, signal?: AbortSignal) =>
  apiSend<T, B>("POST", path, body, signal);
export const apiPut = <T, B = unknown>(path: string, body?: B, signal?: AbortSignal) =>
  apiSend<T, B>("PUT", path, body, signal);
export const apiPatch = <T, B = unknown>(path: string, body?: B, signal?: AbortSignal) =>
  apiSend<T, B>("PATCH", path, body, signal);
export const apiDelete = <T>(path: string, signal?: AbortSignal) =>
  apiSend<T>("DELETE", path, undefined, signal);

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function apiErrorMessage(e: unknown, fallback = "Falha na operação"): string {
  if (isApiError(e)) return e.message || fallback;
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}