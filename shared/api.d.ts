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

export interface LedgerFields {
  businessName: string;
  requirementName: string;
  description: string;
  contact: string;
  completionDate: string;
  riskLevel: string;
  riskCount: string;
  riskResolved: string;
}

export type LedgerDocumentKey = 'evaluationForm' | 'evaluationReport' | 'riskTrackingSheet';

export interface LedgerRecord extends LedgerFields {
  id: number;
  evaluationFormFileName: string | null;
  evaluationReportFileName: string | null;
  riskTrackingSheetFileName: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DashboardResponse {
  totalAssessments: number;
  templateCount: number;
  businessBreakdown: { businessName: string; count: number }[];
  riskStatus: { status: '是' | '否' | '无风险项'; count: number }[];
  unresolvedCount: number;
  unresolvedRisks: {
    id: number;
    requirementName: string;
    businessName: string;
    riskCount: string;
    updatedAt: string;
  }[];
}
