import { google } from 'googleapis';
import { sql } from '@vercel/postgres';

const getClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || '';
const getClientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
const getRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI?.trim() || 'https://trust.palette-lab.com/api/google/callback';

export const createOAuth2Client = () =>
  new google.auth.OAuth2(getClientId(), getClientSecret(), getRedirectUri());

export const getAuthUrl = (customerId: string) => {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: customerId,
  });
};

export const exchangeCode = async (code: string) => {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
};

let tableReady = false;

const ensureTable = async () => {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS google_tokens (
      customer_id TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date BIGINT,
      email TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE google_tokens ADD COLUMN IF NOT EXISTS email TEXT;`;
  tableReady = true;
};

export const saveGoogleTokens = async (
  customerId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
  email?: string,
) => {
  await ensureTable();
  const existing = await sql`SELECT customer_id FROM google_tokens WHERE customer_id = ${customerId}`;
  if (existing.rows.length > 0) {
    if (tokens.refresh_token) {
      await sql`UPDATE google_tokens SET access_token = ${tokens.access_token || null}, refresh_token = ${tokens.refresh_token}, expiry_date = ${tokens.expiry_date || null}, email = COALESCE(${email || null}, email), updated_at = NOW() WHERE customer_id = ${customerId}`;
    } else {
      await sql`UPDATE google_tokens SET access_token = ${tokens.access_token || null}, expiry_date = ${tokens.expiry_date || null}, updated_at = NOW() WHERE customer_id = ${customerId}`;
    }
  } else {
    await sql`INSERT INTO google_tokens (customer_id, access_token, refresh_token, expiry_date, email) VALUES (${customerId}, ${tokens.access_token || null}, ${tokens.refresh_token || null}, ${tokens.expiry_date || null}, ${email || null})`;
  }
};

export const getGoogleTokens = async (customerId: string) => {
  await ensureTable();
  const { rows } = await sql`
    SELECT access_token, refresh_token, expiry_date, email
    FROM google_tokens
    WHERE customer_id = ${customerId} OR customer_id = ${customerId.toLowerCase()} OR customer_id = ${customerId.toUpperCase()}
  `;
  if (!rows.length || !rows[0].refresh_token) return null;
  return {
    access_token: String(rows[0].access_token || ''),
    refresh_token: String(rows[0].refresh_token || ''),
    expiry_date: Number(rows[0].expiry_date || 0),
    email: String(rows[0].email || ''),
  };
};

export const deleteGoogleTokens = async (customerId: string) => {
  await ensureTable();
  await sql`DELETE FROM google_tokens WHERE customer_id = ${customerId} OR customer_id = ${customerId.toLowerCase()} OR customer_id = ${customerId.toUpperCase()}`;
};

export const getAuthenticatedClient = async (customerId: string) => {
  const tokens = await getGoogleTokens(customerId);
  if (!tokens) return null;
  const client = createOAuth2Client();
  client.setCredentials(tokens);
  client.on('tokens', async (newTokens) => {
    await saveGoogleTokens(customerId, newTokens);
  });
  return client;
};
