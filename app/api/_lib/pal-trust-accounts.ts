import { listCrmCustomers, type CrmCustomer } from './palette-crm-client';

export type PalTrustAccount = {
  id: string;
  paletteId: string;
  name: string;
  status: string;
  chatLoginId: string | null;
  chatPasswordSet: boolean;
  agencyId: string | null;
  createdAt: string;
  updatedAt: string;
};

const normalizeCustomerId = (value: string | null | undefined) =>
  String(value || '').normalize('NFKC').trim().toUpperCase();

const crmToTrustAccount = (c: CrmCustomer): PalTrustAccount => ({
  id: c.id,
  paletteId: String(c.loginId || '').toUpperCase(),
  name: c.companyName || c.contactName || '',
  status: c.status || 'active',
  chatLoginId: c.loginId,
  chatPasswordSet: Boolean(c.loginPassword),
  agencyId: c.agencyId,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const listTrustAccountsFromPalDb = async (): Promise<PalTrustAccount[]> => {
  const customers = await listCrmCustomers();
  // palette_crmの全顧客をPalTrustAccountとして返す（pal_trust契約フィルタは呼び出し側で必要に応じて実施）
  return customers
    .filter((c) => c.loginId && c.status === 'active')
    .map(crmToTrustAccount);
};

export const findTrustAccountByCustomerId = async (customerId: string): Promise<PalTrustAccount | null> => {
  const target = normalizeCustomerId(customerId);
  if (!target) return null;
  const accounts = await listTrustAccountsFromPalDb();
  return (
    accounts.find(
      (a) => normalizeCustomerId(a.paletteId) === target || normalizeCustomerId(a.chatLoginId) === target
    ) || null
  );
};

export const findTrustAccountByPaletteId = async (paletteId: string): Promise<PalTrustAccount | null> => {
  const target = normalizeCustomerId(paletteId);
  if (!target) return null;
  const accounts = await listTrustAccountsFromPalDb();
  return accounts.find((a) => normalizeCustomerId(a.paletteId) === target) || null;
};
