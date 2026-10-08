import type {
  ApiErrorResponse, DashboardResponse, GreetingRequest, GreetingResponse, LedgerDocumentKey, LedgerFields,
  LedgerRecord, StatusResponse, TemplateRecord,
} from '../../shared/api.js';

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as ApiErrorResponse;
    return body.error || `请求失败 (${response.status})`;
  } catch {
    return `请求失败 (${response.status})`;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = options?.body instanceof FormData
    ? options.headers
    : { 'Content-Type': 'application/json', ...options?.headers };
  const response = await fetch(path, {
    ...options,
    headers,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function templateForm(name: string, version: string, file?: File) {
  const form = new FormData();
  form.append('name', name);
  form.append('version', version);
  if (file) form.append('file', file);
  return form;
}

function ledgerForm(fields: LedgerFields, files: Partial<Record<LedgerDocumentKey, File | null>>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const [key, file] of Object.entries(files)) {
    if (file) form.append(key, file);
  }
  return form;
}

export const api = {
  dashboard: () => request<DashboardResponse>('/api/dashboard'),
  status: () => request<StatusResponse>('/api/status'),
  greet: (payload: GreetingRequest) =>
    request<GreetingResponse>('/api/greet', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listTemplates: () => request<TemplateRecord[]>('/api/templates'),
  createTemplate: (name: string, version: string, file: File) =>
    request<TemplateRecord>('/api/templates', { method: 'POST', body: templateForm(name, version, file) }),
  updateTemplate: (id: number, name: string, version: string, file?: File) =>
    request<TemplateRecord>(`/api/templates/${id}`, { method: 'PUT', body: templateForm(name, version, file) }),
  deleteTemplate: (id: number) => request<void>(`/api/templates/${id}`, { method: 'DELETE' }),
  downloadTemplate: async (id: number) => {
    const response = await fetch(`/api/templates/${id}/download`);
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.blob();
  },
  generateReport: async (templateId: number, evaluationForm: File) => {
    const form = new FormData();
    form.append('templateId', String(templateId));
    form.append('evaluationForm', evaluationForm);
    const response = await fetch('/api/reports/generate', { method: 'POST', body: form });
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.blob();
  },
  listLedger: () => request<LedgerRecord[]>('/api/ledger'),
  exportLedger: async (filters: Pick<LedgerFields, 'businessName' | 'requirementName' | 'riskLevel' | 'riskResolved'>) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const response = await fetch(`/api/ledger/export?${query}`);
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.blob();
  },
  getLedger: (id: number) => request<LedgerRecord>(`/api/ledger/${id}`),
  createLedger: (fields: LedgerFields, files: Partial<Record<LedgerDocumentKey, File | null>>) =>
    request<LedgerRecord>('/api/ledger', { method: 'POST', body: ledgerForm(fields, files) }),
  updateLedger: (id: number, fields: LedgerFields, files: Partial<Record<LedgerDocumentKey, File | null>>) =>
    request<LedgerRecord>(`/api/ledger/${id}`, { method: 'PUT', body: ledgerForm(fields, files) }),
  deleteLedger: (id: number) => request<void>(`/api/ledger/${id}`, { method: 'DELETE' }),
  replaceLedgerFile: (id: number, key: LedgerDocumentKey, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<LedgerRecord>(`/api/ledger/${id}/files/${key}`, { method: 'PUT', body: form });
  },
  downloadLedgerFile: async (id: number, key: LedgerDocumentKey) => {
    const response = await fetch(`/api/ledger/${id}/files/${key}/download`);
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.blob();
  },
};
