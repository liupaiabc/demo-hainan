import type { RowDataPacket } from 'mysql2';
import type { DashboardResponse } from '../../../shared/api.js';
import { pool } from '../db/pool.js';

type CountRow = RowDataPacket & { count: number };
type BusinessRow = RowDataPacket & { businessName: string; count: number };
type RiskStatusRow = RowDataPacket & { status: '是' | '否' | '无风险项'; count: number };
type UnresolvedRow = RowDataPacket & DashboardResponse['unresolvedRisks'][number];

export async function getDashboard(): Promise<DashboardResponse> {
  const [assessmentRows, templateRows, businessRows, statusRows, unresolvedRows] = await Promise.all([
    pool.query<CountRow[]>('SELECT COUNT(*) AS count FROM assessment_ledger'),
    pool.query<CountRow[]>('SELECT COUNT(*) AS count FROM template'),
    pool.query<BusinessRow[]>(`SELECT business_name AS businessName, COUNT(*) AS count
      FROM assessment_ledger GROUP BY business_name ORDER BY count DESC, business_name ASC`),
    pool.query<RiskStatusRow[]>(`SELECT risk_resolved AS status, COUNT(*) AS count
      FROM assessment_ledger GROUP BY risk_resolved`),
    pool.query<UnresolvedRow[]>(`SELECT id, requirement_name AS requirementName,
      business_name AS businessName, risk_count AS riskCount,
      DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt
      FROM assessment_ledger WHERE risk_resolved = '否'
      ORDER BY updated_at DESC, id DESC LIMIT 10`),
  ]);

  const riskStatus: DashboardResponse['riskStatus'] = ['是', '否', '无风险项'].map((status) => ({
    status: status as '是' | '否' | '无风险项',
    count: statusRows[0].find((row) => row.status === status)?.count ?? 0,
  }));

  return {
    totalAssessments: assessmentRows[0][0].count,
    templateCount: templateRows[0][0].count,
    businessBreakdown: businessRows[0].map(({ businessName, count }) => ({ businessName, count })),
    riskStatus,
    unresolvedCount: riskStatus.find((item) => item.status === '否')?.count ?? 0,
    unresolvedRisks: unresolvedRows[0].map(({ id, requirementName, businessName, riskCount, updatedAt }) => ({
      id, requirementName, businessName, riskCount, updatedAt,
    })),
  };
}
