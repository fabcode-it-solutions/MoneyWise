import { API_BASE, RATE_CACHE_DURATION, RATE_FETCH_COOLDOWN } from './constants.js';
import {
  getCsrfToken, setCsrfToken, getIsLoggedIn,
  setExpense, getCurrentSpaceId, setCurrentSpaceId, getCurrentSpace,
  getSpaces, setSpaces, getPendingInvites, setPendingInvites,
  subscribeSpaceChannel, unsubscribeSpaceChannel,
  setEmail, setUserId, setIsLoggedIn, startPolling, stopPolling, initPusher,
  getCurrentCurrency, setCurrentCurrency,
  getCurrencyRates, setCurrencyRates,
  getLastRateFetch, setLastRateFetch,
  getRateLimitHit, setRateLimitHit,
  getRateLimitHitTime, setRateLimitHitTime,
  getRateFetchAttempts,
  setRatesAreLive,
  navigate,
} from './state.svelte.js';
import { getLocale, localizeServerError, t } from './i18n.svelte.js';
import type { Expense, Profile, WeeklySummary, Space } from '../types.js';

// Prevent an older polling/Pusher response from restoring transactions after
// a successful delete.
let expenseLoadGeneration = 0;

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ?? (method === 'DELETE' ? JSON.stringify({}) : undefined);
  return fetch(`${API_BASE}${path}`, {
    ...options,
    body,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': getCsrfToken() ?? '',
      ...(options.headers ?? {}),
    },
  });
}

function expensesBasePath(): string {
  const spaceId = getCurrentSpaceId();
  return spaceId ? `/spaces/${spaceId}/expenses` : '/expenses';
}

export function mapServerExpense(exp: any): Expense {
  const authorUserId = exp.authorUserId ? String(exp.authorUserId) : undefined;
  let authorNickname: string | undefined;
  if (authorUserId) {
    const space = getCurrentSpace();
    authorNickname = space?.members.find(m => m.userId === authorUserId)?.nickname;
  }
  return {
    id: exp._id,
    type: exp.type as 'income' | 'expense',
    amount: exp.amount,
    category: exp.category,
    date: (exp.date ?? '').substring(0, 10),
    familyMember: exp.familyMember ?? '',
    name: exp.name ?? '',
    note: exp.note ?? '',
    currency: exp.currency ?? 'USD',
    recurrence: exp.recurrence ?? null,
    authorUserId,
    authorNickname,
  };
}

function mapServerSpace(sp: any): Space {
  return {
    id: sp._id,
    name: sp.name,
    ownerId: String(sp.ownerId),
    members: (sp.members ?? []).map((m: any) => ({
      userId: String(m.userId),
      nickname: m.nickname,
      role: m.role,
      status: m.status,
    })),
  };
}

export async function fetchCsrfToken(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/auth/csrf`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setCsrfToken(data.token);
    }
  } catch {
    console.error('Unable to connect to server');
  }
}

export async function loadExpenses(): Promise<void> {
  if (!getIsLoggedIn()) return;
  const generation = expenseLoadGeneration;
  try {
    const res = await apiFetch(expensesBasePath());
    if (!res.ok) return;
    const data = await res.json();
    if (generation !== expenseLoadGeneration) return;
    setExpense(data.map(mapServerExpense));
  } catch (err) {
    console.error('Failed to load expense:', err);
  }
}

async function handleJsonResponse(res: Response, fallbackError: string): Promise<any> {
  const contentType = res.headers.get('content-type');
  const isJson = contentType?.includes('application/json');

  if (!res.ok) {
    if (isJson) {
      const data = await res.json();
      const err = new Error(localizeServerError(data.error ?? fallbackError)) as any;
      err.status = res.status;
      if (data.retryAfter) err.retryAfter = data.retryAfter;
      throw err;
    }
    const err = new Error(t('common.serverError', { status: res.status })) as any;
    err.status = res.status;
    throw err;
  }

  if (isJson) {
    return res.json();
  }
  return null;
}

export async function login(email: string, password: string): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() ?? '' },
    body: JSON.stringify({ email, password }),
  });
  return handleJsonResponse(res, 'Login failed');
}

export async function register(email: string, password: string): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() ?? '' },
    body: JSON.stringify({ email, password }),
  });
  return handleJsonResponse(res, 'Registration failed');
}

export async function logout(): Promise<void> {
  stopPolling();
  unsubscribeSpaceChannel();
  setIsLoggedIn(false);
  setExpense([]);
  setEmail('');
  setCurrentSpaceId(null);
  setSpaces([]);
  setPendingInvites([]);
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() ?? '' },
    });
  } catch {}
  sessionStorage.setItem('sw_logged_out', 'true');
  navigate('/login');
}

export async function deleteAccount(): Promise<void> {
  const res = await apiFetch('/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true }),
  });
  await handleJsonResponse(res, 'Failed to delete account');
  // Same client-side teardown as logout — all server data is gone.
  stopPolling();
  unsubscribeSpaceChannel();
  setIsLoggedIn(false);
  setExpense([]);
  setEmail('');
  setCurrentSpaceId(null);
  setSpaces([]);
  setPendingInvites([]);
  sessionStorage.setItem('sw_logged_out', 'true');
  navigate('/login');
}

export async function checkSession(): Promise<boolean> {
  sessionStorage.removeItem('sw_logged_out');
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      // The CSRF token is bound to the authenticated session cookie. Refresh
      // it after restoring the session so state-changing requests are valid.
      await fetchCsrfToken();
      setIsLoggedIn(true);
      setEmail(data.email);
      setUserId(data.id);
      initPusher(data.id);
      startPolling();
      loadExpenses();
      fetchSpaces();
      fetchPendingInvites();
      if (data.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone) {
        syncTimezone();
      }
      return true;
    }
  } catch {}
  return false;
}

export async function showApp(email: string, userId?: string): Promise<void> {
  // Login/register replaces the session cookie, so the token fetched before
  // authentication is no longer valid for DELETE/POST/PUT requests.
  await fetchCsrfToken();
  sessionStorage.removeItem('sw_logged_out');
  setIsLoggedIn(true);
  setEmail(email);
  if (userId) {
    setUserId(userId);
    initPusher(userId);
  }
  loadExpenses();
  fetchSpaces();
  fetchPendingInvites();
  startPolling();
  syncTimezone();
}

export async function saveTransaction({ type, amount, category, date, name = '', note = '', recurrence }: Partial<Expense>): Promise<Expense | null> {
  if (!type || amount === undefined || Number.isNaN(amount) || !category || !date) return null;

  const body: Record<string, any> = { type, amount, category, date, name, note, currency: getCurrentCurrency() };
  if (recurrence) {
    body.recurrence = {
      frequency: recurrence.frequency,
      nextDueDate: recurrence.nextDueDate || date,
      endDate: recurrence.endDate || null,
      isActive: recurrence.isActive,
    };
  }

  if (getIsLoggedIn()) {
    try {
      const res = await apiFetch(expensesBasePath(), {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to save expense:', err.error ?? res.status);
        return null;
      }
      return mapServerExpense(await res.json());
    } catch (err) {
      console.error('Network error saving expense:', err);
      return null;
    }
  }

  return {
    id: String(Date.now()), type: type as 'income' | 'expense', amount, category, date, name, note,
    currency: getCurrentCurrency(),
    recurrence: recurrence ?? null,
  };
}

export async function deleteExpenseOnServer(id: string): Promise<boolean> {
  if (getIsLoggedIn()) {
    // Capture the ledger before awaiting the request. This keeps the delete
    // tied to the ledger the user clicked in, even if navigation changes.
    const path = expensesBasePath();
    try {
      const res = await apiFetch(`${path}/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error('Failed to delete expense, status:', res.status);
        return false;
      }
      expenseLoadGeneration += 1;
    } catch (err) {
      console.error('Network error deleting expense:', err);
      return false;
    }
  }
  return true;
}

export async function updateExpenseOnServer(id: string, data: Partial<Expense>): Promise<Expense> {
  const body: Record<string, any> = {};
  if (data.type !== undefined) body.type = data.type;
  if (data.amount !== undefined) body.amount = data.amount;
  if (data.category !== undefined) body.category = data.category;
  if (data.date !== undefined) body.date = data.date;
  if (data.name !== undefined) body.name = data.name;
  if (data.note !== undefined) body.note = data.note;
  if (data.currency !== undefined) body.currency = data.currency;
  if (data.recurrence !== undefined) {
    if (data.recurrence) {
      body.recurrence = {
        frequency: data.recurrence.frequency,
        nextDueDate: data.recurrence.nextDueDate || data.date,
        endDate: data.recurrence.endDate || null,
        isActive: data.recurrence.isActive,
      };
    } else {
      body.recurrence = null;
    }
  }
  try {
    const res = await apiFetch(`${expensesBasePath()}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return mapServerExpense(await handleJsonResponse(res, 'Failed to save changes.'));
  } catch (err) {
    console.error('Network error editing expense:', err);
    throw err;
  }
}

export async function fetchSpaces(): Promise<void> {
  if (!getIsLoggedIn()) return;
  try {
    const res = await apiFetch('/spaces');
    if (!res.ok) return;
    const data = await res.json();
    setSpaces(data.map(mapServerSpace));
  } catch (err) {
    console.error('Failed to load Hubs:', err);
  }
}

export async function fetchPendingInvites(): Promise<void> {
  if (!getIsLoggedIn()) return;
  try {
    const res = await apiFetch('/spaces/invites');
    if (!res.ok) return;
    const data = await res.json();
    setPendingInvites(data.map(mapServerSpace));
  } catch (err) {
    console.error('Failed to load pending invites:', err);
  }
}

export async function createSpace(name: string): Promise<Space | null> {
  try {
    const res = await apiFetch('/spaces', { method: 'POST', body: JSON.stringify({ name }) });
    const data = await handleJsonResponse(res, 'Failed to create Hub');
    const space = mapServerSpace(data);
    setSpaces([...getSpaces(), space]);
    return space;
  } catch (err) {
    console.error('Failed to create Hub:', err);
    throw err;
  }
}

export async function renameSpace(spaceId: string, name: string): Promise<Space> {
  const res = await apiFetch(`/spaces/${spaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
  const data = await handleJsonResponse(res, 'Failed to rename Hub');
  const space = mapServerSpace(data);
  setSpaces(getSpaces().map(s => s.id === space.id ? space : s));
  return space;
}

export async function addSpaceMember(spaceId: string, email: string, nickname: string): Promise<Space> {
  const res = await apiFetch(`/spaces/${spaceId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, nickname }),
  });
  const data = await handleJsonResponse(res, 'Failed to invite member');
  const space = mapServerSpace(data);
  setSpaces(getSpaces().map(s => s.id === space.id ? space : s));
  return space;
}

export async function renameSpaceMember(spaceId: string, userId: string, nickname: string): Promise<Space> {
  const res = await apiFetch(`/spaces/${spaceId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ nickname }),
  });
  const data = await handleJsonResponse(res, 'Failed to rename member');
  const space = mapServerSpace(data);
  setSpaces(getSpaces().map(s => s.id === space.id ? space : s));
  return space;
}

export async function removeSpaceMember(spaceId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/spaces/${spaceId}/members/${userId}`, { method: 'DELETE' });
  const data = await handleJsonResponse(res, 'Failed to remove member');
  const space = mapServerSpace(data);
  setSpaces(getSpaces().map(s => s.id === space.id ? space : s));
}

export async function leaveSpace(spaceId: string, userId: string): Promise<void> {
  await removeSpaceMember(spaceId, userId);
  setSpaces(getSpaces().filter(s => s.id !== spaceId));
  if (getCurrentSpaceId() === spaceId) {
    await switchSpace(null);
  }
}

export async function respondToInvite(spaceId: string, accept: boolean): Promise<void> {
  const res = await apiFetch(`/spaces/${spaceId}/invites/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
  await handleJsonResponse(res, 'Failed to respond to invite');
  setPendingInvites(getPendingInvites().filter(s => s.id !== spaceId));
  if (accept) await fetchSpaces();
}

export async function deleteSpace(spaceId: string): Promise<void> {
  const res = await apiFetch(`/spaces/${spaceId}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true }),
  });
  await handleJsonResponse(res, 'Failed to delete Hub');
  setSpaces(getSpaces().filter(s => s.id !== spaceId));
  if (getCurrentSpaceId() === spaceId) {
    await switchSpace(null);
  }
}

export async function switchSpace(spaceId: string | null): Promise<void> {
  setCurrentSpaceId(spaceId);
  if (spaceId) subscribeSpaceChannel(spaceId);
  else unsubscribeSpaceChannel();
  // Never leave transactions from the previous ledger visible while the new
  // ledger is loading. This is especially important when a Hub is deleted:
  // its records must not remain in memory and look like personal records if
  // the follow-up request fails.
  setExpense([]);
  await loadExpenses();
}

export async function fetchCurrencyRates(baseCurrency: string = 'USD'): Promise<any> {
  if (getRateLimitHit() && Date.now() - getRateLimitHitTime() < RATE_FETCH_COOLDOWN) {
    if (getCurrencyRates()[baseCurrency]) {
      return getCurrencyRates()[baseCurrency];
    }
    return null;
  }

  const attempts = getRateFetchAttempts();
  if (Date.now() - (attempts[baseCurrency] || 0) < 30000) return null;
  attempts[baseCurrency] = Date.now();

  if (getCurrencyRates()[baseCurrency] && Date.now() - getLastRateFetch() < RATE_CACHE_DURATION) {
    return getCurrencyRates()[baseCurrency];
  }

  try {
    const res = await apiFetch(`/currency/rates?base=${baseCurrency}`);
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      if (res.status === 429 || errorData.error?.includes('rate limit') || errorData.error?.includes('quota')) {
        setRateLimitHit(true);
        setRateLimitHitTime(Date.now());
        return null;
      }
      return null;
    }
    const data = await res.json();
    setRateLimitHit(false);
    setRatesAreLive(data.live !== false);
    return data.rates;
  } catch (err) {
    console.error('Currency rate fetch error:', err);
    setRatesAreLive(false);
    return null;
  }
}

export async function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency === toCurrency) return amount;

  const cacheKey = fromCurrency;
  if (getCurrencyRates()[cacheKey] && Date.now() - getLastRateFetch() < RATE_CACHE_DURATION) {
    const rate = getCurrencyRates()[cacheKey][toCurrency];
    if (rate) return amount * rate;
  }

  const rates = await fetchCurrencyRates(fromCurrency);
  if (rates) {
    setCurrencyRates({ ...getCurrencyRates(), [cacheKey]: rates });
    setLastRateFetch(Date.now());
    setRateLimitHit(false);
    setRateLimitHitTime(0);
    const rate = rates[toCurrency];
    if (rate) return amount * rate;
  }

  return amount;
}

export async function uploadBulkExpenses(rows: any[]): Promise<any> {
  const res = await apiFetch('/expenses/bulk', {
    method: 'POST',
    body: JSON.stringify({ rows }),
  });
  return handleJsonResponse(res, 'Bulk upload failed');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<any> {
  const res = await apiFetch('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return handleJsonResponse(res, 'Failed to update password.');
}

export async function deleteAllExpenses(): Promise<void> {
  const res = await apiFetch('/expenses', { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
  await handleJsonResponse(res, 'Failed to delete all expenses');
  expenseLoadGeneration += 1;
}

export async function fetchAiQuota(): Promise<{ weeklyRemaining: number }> {
  const res = await apiFetch('/ai/quota');
  return handleJsonResponse(res, 'Failed to fetch AI quota');
}

export async function fetchSummaries(): Promise<{ summaries: WeeklySummary[] }> {
  const res = await apiFetch(`/summaries?lang=${getLocale()}`);
  return handleJsonResponse(res, 'Failed to fetch summaries');
}

export async function syncTimezone(): Promise<void> {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    await apiFetch('/auth/timezone', {
      method: 'PUT',
      body: JSON.stringify({ timezone }),
    });
  } catch {
    // best-effort — a missing/stale timezone just falls back to UTC server-side
  }
}

// spaceId selects the ledger the AI reads and edits. null/undefined means the
// user's personal ledger. It is passed explicitly by the AI panel so the chat
// can target a Hub independently of the app's current Hub selection.
export async function sendAiMessage(message: string, history: any[], spaceId?: string | null): Promise<any> {
  const res = await apiFetch('/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history, spaceId: spaceId ?? undefined, lang: getLocale() }),
  });
  return handleJsonResponse(res, 'AI request failed');
}

export async function loadRecurringExpenses(): Promise<Expense[]> {
  try {
    const res = await apiFetch(`${expensesBasePath()}/recurring`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map(mapServerExpense);
  } catch {
    return [];
  }
}

export async function updateRecurring(id: string, updates: { frequency?: string; endDate?: string | null; isActive?: boolean; nextDueDate?: string }): Promise<Expense | null> {
  try {
    const res = await apiFetch(`${expensesBasePath()}/${id}/recurring`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) return null;
    return mapServerExpense(await res.json());
  } catch {
    return null;
  }
}

export async function parseReceipt(imageData: string, pro = false): Promise<any> {
  const res = await apiFetch('/ai/parse-receipt', {
    method: 'POST',
    body: JSON.stringify({ imageData, pro }),
  });
  return handleJsonResponse(res, 'AI request failed');
}

export async function parseReceiptsBulk(images: string[], pro = false): Promise<any> {
  const res = await apiFetch('/ai/parse-receipts-bulk', {
    method: 'POST',
    body: JSON.stringify({ images, pro }),
  });
  return handleJsonResponse(res, 'AI request failed');
}

export async function getProfile(): Promise<Profile> {
  const res = await apiFetch('/auth/me');
  return handleJsonResponse(res, 'Failed to load profile');
}
