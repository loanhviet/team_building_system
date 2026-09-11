const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    credentials: "include",
  });
}

async function tryRefresh(): Promise<boolean> {
  const res = await rawFetch("/api/auth/refresh", { method: "POST" });
  if (!res.ok) {
    setAccessToken(null);
    return false;
  }
  const data = await res.json();
  setAccessToken(data.access_token);
  return true;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  _isRetry = false,
): Promise<T> {
  const res = await rawFetch(path, init);

  if (res.status === 401 && !_isRetry && path !== "/api/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return apiFetch<T>(path, init, true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? "unknown_error",
      body?.error?.message ?? `Request failed: ${res.status}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? "unknown_error",
      body?.error?.message ?? `Request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}
