export interface StatusResponse {
  status: 'ok';
  service: 'koa';
  time: string;
}

export interface GreetingRequest {
  name: string;
}

export interface GreetingResponse {
  message: string;
}

export interface ApiErrorResponse {
  error: string;
}

export interface TemplateRecord {
  id: number;
  name: string;
  version: string;
  uploadedAt: string;
  uploadedBy: string;
  updatedAt: string;
  updatedBy: string;
}
