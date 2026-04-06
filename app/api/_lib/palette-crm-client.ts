const getCanvasUrl = (): string =>
  process.env.PALETTE_CANVAS_URL?.trim() || 'https://palettecrm.vercel.app';

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
  const res = await fetch(`${getCanvasUrl()}/api/crm/customers`, { cache: 'no-store' });
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
  const customers = await listCrmCustomers();
  return customers.find(
    (c) =>
      String(c.loginId || '') === loginId &&
      String(c.loginPassword || '') === password
  ) || null;
};
