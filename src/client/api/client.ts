let currentCsrfToken = '';

export function setCsrfToken(token: string): void {
  currentCsrfToken = token;
}

export function getCsrfToken(): string {
  return currentCsrfToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (currentCsrfToken) {
    headers.set('x-csrf-token', currentCsrfToken);
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const data = await response.json();
      if (data && data.error) {
        errorMsg = data.error;
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return '-';
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatDateTimeThai(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

