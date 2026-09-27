import axios, { type AxiosInstance } from 'axios';

const ACCESS_KEY = 'lp.access';
const REFRESH_KEY = 'lp.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY) ?? '';
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY) ?? '';
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api: AxiosInstance = axios.create({ baseURL: '/api', timeout: 15_000 });

api.interceptors.request.use((config) => {
  if (tokens.access) config.headers.Authorization = `Bearer ${tokens.access}`;
  return config;
});

/**
 * On a 401, try the refresh token exactly once and replay the original
 * request. Concurrent 401s share a single refresh so a burst of requests
 * cannot rotate the token several times over and log the user out.
 */
let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken: tokens.refresh });
    tokens.set(data.data.accessToken, data.data.refreshToken);
    return true;
  } catch {
    tokens.clear();
    return false;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing ??= doRefresh().finally(() => {
        refreshing = null;
      });
      if (await refreshing) {
        original.headers.Authorization = `Bearer ${tokens.access}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Pulls the human-readable message out of an API error shape. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message ?? err.message ?? 'Network error';
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
