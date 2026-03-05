export const getPalDbBaseUrl = (): string => {
  const configured = process.env.PAL_DB_BASE_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === 'production'
    ? 'https://pal-db.onrender.com'
    : 'http://localhost:3100';
};

export const buildPalDbUrl = (path: string): string => {
  const base = getPalDbBaseUrl().replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

export const palDbGet = async (path: string): Promise<Response> => {
  return fetch(buildPalDbUrl(path), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const palDbPost = async (path: string, body: unknown): Promise<Response> => {
  return fetch(buildPalDbUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
};