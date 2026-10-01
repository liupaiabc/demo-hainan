import type { ApiErrorResponse, GreetingRequest, GreetingResponse, StatusResponse, TemplateRecord } from '../../shared/api.js';

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

export const api = {
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
};
