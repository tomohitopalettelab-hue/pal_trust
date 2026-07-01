import { palDbPost } from './pal-db-client';

const getCanvasUrl = (): string =>
  process.env.PALETTE_CANVAS_URL?.trim() || 'https://palettecrm.vercel.app';

/** Palette Lab で一時停止(status!=='active')された顧客か。Canvas障害時は false（fail-open）。
 *  key は customerId(=paletteId or login_id いずれか一致)。 */
export const isCustomerSuspended = async (key: string): Promise<boolean> => {
  const k = String(key || '').trim();
  if (!k) return false;
  try {
    const res = await fetch(`${getCanvasUrl()}/api/pal-db/account-active?key=${encodeURIComponent(k)}`, {
      cache: 'no-store', headers: { 'x-crm-service-key': process.env.CRM_SERVICE_KEY ?? '' },
    });
    const d = (await res.json().catch(() => ({}))) as { active?: boolean };
    return !!(d && d.active === false);
  } catch { return false; }
};

export type CrmCustomer = {
  id: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  agencyId: string | null;
  loginId: string | null;
  loginPassword: string | null;
  industry: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

let _cache: { customers: CrmCustomer[]; fetchedAt: number } | null = null;
const CACHE_TTL = 10_000; // 10秒

export const listCrmCustomers = async (): Promise<CrmCustomer[]> => {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL) {
    return _cache.customers;
  }
  const res = await fetch(`${getCanvasUrl()}/api/crm/customers`, { cache: 'no-store', headers: { 'x-crm-service-key': process.env.CRM_SERVICE_KEY ?? '' } });
  const data = await res.json().catch(() => ({ data: [] }));
  const customers: CrmCustomer[] = Array.isArray(data?.data) ? data.data : [];
  _cache = { customers, fetchedAt: Date.now() };
  return customers;
};

export const findCrmCustomerByLoginId = async (loginId: string): Promise<CrmCustomer | null> => {
  const customers = await listCrmCustomers();
  const target = String(loginId || '').trim().toUpperCase();
  return customers.find(
    (c) => String(c.loginId || '').toUpperCase() === target
  ) || null;
};

export const verifyCrmLogin = async (loginId: string, password: string): Promise<CrmCustomer | null> => {
  // 認証は palette_crm の verify-chat-login（scrypt ハッシュ照合）に委譲。
  // pal_trust 側で平文パスワードを取得・比較しない。
  let res: Response;
  try {
    res = await palDbPost('/api/verify-chat-login', { id: loginId, password });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.success) return null;
  // 認証成功 → 顧客データ（パスワード以外）を取得して返す
  return await findCrmCustomerByLoginId(loginId);
};

// --- Contracts / Products ---

export type CrmContract = {
  id: string;
  customerId: string;
  productId: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type CrmProduct = {
  id: string;
  name: string;
  status: string;
};

let _contractCache: { contracts: CrmContract[]; fetchedAt: number } | null = null;
let _productCache: { products: CrmProduct[]; fetchedAt: number } | null = null;

export const listCrmContracts = async (): Promise<CrmContract[]> => {
  if (_contractCache && Date.now() - _contractCache.fetchedAt < CACHE_TTL) {
    return _contractCache.contracts;
  }
  const res = await fetch(`${getCanvasUrl()}/api/crm/contracts`, { cache: 'no-store', headers: { 'x-crm-service-key': process.env.CRM_SERVICE_KEY ?? '' } });
  const data = await res.json().catch(() => ({ data: [] }));
  const contracts: CrmContract[] = Array.isArray(data?.data) ? data.data : [];
  _contractCache = { contracts, fetchedAt: Date.now() };
  return contracts;
};

export const listCrmProducts = async (): Promise<CrmProduct[]> => {
  if (_productCache && Date.now() - _productCache.fetchedAt < CACHE_TTL) {
    return _productCache.products;
  }
  const res = await fetch(`${getCanvasUrl()}/api/crm/products`, { cache: 'no-store', headers: { 'x-crm-service-key': process.env.CRM_SERVICE_KEY ?? '' } });
  const data = await res.json().catch(() => ({ data: [] }));
  const products: CrmProduct[] = Array.isArray(data?.data) ? data.data : [];
  _productCache = { products, fetchedAt: Date.now() };
  return products;
};

// Pal Trust契約中の顧客IDセットを取得
export const getPalTrustCustomerIds = async (): Promise<Set<string>> => {
  const [products, contracts] = await Promise.all([
    listCrmProducts(),
    listCrmContracts(),
  ]);
  // Pal Trust商品（複数バリエーション含む。productName が "Pal Trust" を含むもの）
  const palTrustProductIds = new Set(
    products
      .filter((p) => /pal\s*trust/i.test(String(p.name || '')))
      .map((p) => p.id)
  );
  // 有効な契約のみ
  const customerIds = new Set<string>();
  contracts.forEach((c) => {
    if (String(c.status || '').toLowerCase() !== 'active') return;
    if (!palTrustProductIds.has(c.productId)) return;
    if (c.customerId) customerIds.add(c.customerId);
  });
  return customerIds;
};
