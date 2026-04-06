import { palDbGet } from './pal-db-client';

type PalDbAccount = {
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

type ContractItem = {
  accountId: string;
  planId: string;
};

type PlanItem = {
  id: string;
  code: string;
};

const normalize = (value: string | null | undefined) => String(value || '').trim().toLowerCase();
const normalizeCustomerId = (value: string | null | undefined) => String(value || '').normalize('NFKC').trim().toUpperCase();

const isPalTrustPlanCode = (code: string): boolean => {
  const normalized = normalize(code).replace(/-/g, '_');
  return normalized.includes('pal_trust') || normalized === 'trust' || normalized.startsWith('trust_');
};

export const todayYmd = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const listTrustAccountsFromPalDb = async (): Promise<PalDbAccount[]> => {
  const activeOn = todayYmd();
  const [accountsRes, contractsRes, plansRes] = await Promise.all([
    palDbGet('/api/accounts'),
    palDbGet(`/api/contracts?activeOn=${encodeURIComponent(activeOn)}`),
    palDbGet('/api/plans?includeInactive=1'),
  ]);

  if (!accountsRes.ok) {
    throw new Error('pal_db の顧客一覧取得に失敗しました');
  }
  if (!contractsRes.ok) {
    throw new Error('pal_db の契約一覧取得に失敗しました');
  }
  if (!plansRes.ok) {
    throw new Error('pal_db のプラン一覧取得に失敗しました');
  }

  const accountsBody = await accountsRes.json().catch(() => ({}));
  const contractsBody = await contractsRes.json().catch(() => ({}));
  const plansBody = await plansRes.json().catch(() => ({}));

  const accounts: PalDbAccount[] = Array.isArray(accountsBody?.accounts) ? accountsBody.accounts : [];
  const contracts: ContractItem[] = Array.isArray(contractsBody?.contracts) ? contractsBody.contracts : [];
  const plans: PlanItem[] = Array.isArray(plansBody?.plans) ? plansBody.plans : [];

  const trustPlanIds = new Set(
    plans
      .filter((plan) => isPalTrustPlanCode(plan.code))
      .map((plan) => String(plan.id || '').trim())
      .filter(Boolean),
  );

  const trustAccountIds = new Set(
    contracts
      .filter((item) => trustPlanIds.has(String(item.planId || '').trim()))
      .map((item) => String(item.accountId || '').trim())
      .filter(Boolean),
  );

  return accounts.filter((account) => trustAccountIds.has(String(account.id || '').trim()));
};

export const findTrustAccountByPaletteId = async (paletteId: string): Promise<PalDbAccount | null> => {
  const target = normalizeCustomerId(paletteId);
  if (!target) return null;
  const accounts = await listTrustAccountsFromPalDb();
  return accounts.find((account) => normalizeCustomerId(account.paletteId) === target) || null;
};

export const findTrustAccountByCustomerId = async (customerId: string): Promise<PalDbAccount | null> => {
  const target = normalizeCustomerId(customerId);
  if (!target) return null;
  const accounts = await listTrustAccountsFromPalDb();
  return (
    accounts.find((account) =>
      normalizeCustomerId(account.paletteId) === target || normalizeCustomerId(account.chatLoginId) === target,
    ) || null
  );
};
