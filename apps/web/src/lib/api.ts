const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15000;

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

/** Every raw `fetch` in this file goes through here so a dropped connection
 * or a slow server doesn't hang a screen forever or throw a raw browser
 * `TypeError` into Vietnamese UI text. Not used by apiChatStream — an SSE
 * stream is expected to run long, so a fixed timeout would kill it early. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "timeout", "Máy chủ phản hồi quá lâu, vui lòng thử lại.");
    }
    throw new ApiError(0, "network_error", "Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối mạng.");
  } finally {
    clearTimeout(timer);
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
    credentials: "include",
  });
}

// Six queries can all get a 401 at once (a page that fires several requests
// on mount) — without this, each one kicks off its own /auth/refresh call,
// which races a rotating refresh token into logging everyone out. One
// in-flight refresh is shared by every caller instead.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const res = await rawFetch("/api/auth/refresh", { method: "POST" });
    if (!res.ok) {
      setAccessToken(null);
      return false;
    }
    const data = await res.json();
    setAccessToken(data.access_token);
    return true;
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function errorFromResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  return new ApiError(
    res.status,
    body?.error?.code ?? "unknown_error",
    body?.error?.message ?? `Yêu cầu thất bại (mã lỗi ${res.status})`,
  );
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

  if (!res.ok) throw await errorFromResponse(res);

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, "download_failed", "Tải file thất bại");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function apiChatStream(
  path: string,
  body: unknown,
  onEvent: (data: { delta?: string; done?: boolean; citations?: unknown; error?: string }) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new ApiError(res.status, "chat_failed", "Không gửi được tin nhắn");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()));
      } catch {
        // ignore malformed chunk
      }
    }
  }
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    credentials: "include",
    body: formData,
  });

  if (!res.ok) throw await errorFromResponse(res);

  return res.json() as Promise<T>;
}
