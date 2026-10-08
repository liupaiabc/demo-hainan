import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Skeleton } from 'antd';
import { Link } from 'react-router';
import type { EChartsCoreOption } from 'echarts/core';
import type { DashboardResponse } from '../../../shared/api.js';
import { api } from '../api';
import { DashboardChart } from '../components/DashboardChart';
import { Icon } from '../components/Icon';

const barColors = ['#1677d9', '#55a7ed', '#82c2f3', '#a8d2f4'];

function barOption(businesses: DashboardResponse['businessBreakdown']): EChartsCoreOption {
  const maxCount = Math.max(0, ...businesses.map((item) => item.count));
  return {
    animationDuration: 450,
    color: barColors,
    grid: { top: 12, right: 12, bottom: 34, left: 42, containLabel: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: any) => {
      const item = params[0];
      return `${item.axisValue}<br/>完成评估数量：${item.value}`;
    } },
    xAxis: {
      type: 'category', data: businesses.map((item) => item.businessName),
      axisTick: { show: false }, axisLine: { lineStyle: { color: '#dce5f0' } },
      axisLabel: { color: '#566174', fontSize: 12, interval: 0, width: 72, overflow: 'truncate' },
    },
    yAxis: {
      type: 'value', max: Math.max(1, Math.ceil(maxCount * 1.25)), minInterval: 1,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#8a95a4' }, splitLine: { lineStyle: { color: '#e8edf4', type: 'dashed' } },
    },
    series: [{
      type: 'bar', barMaxWidth: 42,
      data: businesses.map((item, index) => ({
        value: item.count, itemStyle: { color: barColors[index % barColors.length], borderRadius: [5, 5, 0, 0] },
      })),
      label: { show: true, position: 'top', color: '#3a6c9f', fontSize: 12 },
    }],
  };
}

function riskOption(items: DashboardResponse['riskStatus']): EChartsCoreOption {
  const labels: Record<string, string> = { '否': '未处置完成', '是': '已处置完成', '无风险项': '无风险项' };
  const colors: Record<string, string> = { '否': '#1479e4', '是': '#acd2f5', '无风险项': '#dce6f2' };
  return {
    tooltip: { trigger: 'item', formatter: '{b}：{c} ({d}%)' },
    series: [{
      type: 'pie', radius: ['67%', '84%'], center: ['50%', '50%'],
      label: { show: false }, emphasis: { scale: false },
      data: items.map((item) => ({ name: labels[item.status], value: item.count, itemStyle: { color: colors[item.status] } })),
    }],
  };
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.dashboard().then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '加载首页数据失败');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const topBusinesses = data?.businessBreakdown.slice(0, 4) ?? [];
  const compactBars = useMemo(() => barOption(topBusinesses), [data]);
  const risks = useMemo(() => riskOption(data?.riskStatus ?? []), [data]);

  return (
    <div className="page-wrap dashboard-page">
      {error && <Alert className="load-error" type="error" showIcon message={error} action={<Button size="small" onClick={() => window.location.reload()}>重试</Button>} />}
      {loading ? <div className="dashboard-loading"><Skeleton active paragraph={{ rows: 12 }} /></div> : data && <>
        <div className="dashboard-top-grid">
          <section className="dashboard-panel dashboard-stat dashboard-total">
            <h1>已完成评估总数量</h1>
            <div className="dashboard-stat-body"><strong>{data.totalAssessments}</strong><div className="dashboard-orbit" aria-hidden="true" /></div>
            <p>已记录的评估台账数量</p>
          </section>
          <section className="dashboard-panel dashboard-top-chart">
            <h2>各业务完成评估数量</h2>
            {topBusinesses.length ? <DashboardChart className="dashboard-chart-small" option={compactBars} label="各业务完成评估数量柱状图" /> : <Empty description="暂无评估数据" />}
          </section>
        </div>

        <div className="dashboard-middle-grid">
          <section className="dashboard-panel dashboard-stat dashboard-risk">
            <h2>风险未处置完成需求数量</h2>
            <div className="dashboard-stat-body">
              <div><strong>{data.unresolvedCount}</strong><p>条评估记录待处理</p></div>
              {data.totalAssessments > 0 && <DashboardChart className="dashboard-chart-donut" option={risks} label="风险处置状态环形图" />}
            </div>
          </section>
          <section className="dashboard-panel dashboard-list-panel">
            <div className="dashboard-panel-heading"><h2>风险未处置完成列表</h2><Link to="/ledger">查看全部</Link></div>
            <div className="dashboard-table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>需求名称</th><th>风险项个数</th><th>更新时间</th></tr></thead>
                <tbody>{data.unresolvedRisks.map((row) => <tr key={row.id}>
                  <td><span className="dashboard-row-mark"><Icon name="plus" size={14} /></span><span className="dashboard-requirement" title={`${row.businessName} / ${row.requirementName}`}>{row.requirementName}</span></td>
                  <td>{row.riskCount}</td><td>{formatDate(row.updatedAt)}</td>
                </tr>)}</tbody>
              </table>
              {!data.unresolvedRisks.length && <Empty description="暂无未处置完成的风险" />}
            </div>
          </section>
        </div>

        <div className="dashboard-actions">
          <Link to="/templates" className="dashboard-action"><Icon name="template" size={36} /><span><strong>前往模板管理</strong><small>已上传 {data.templateCount} 份模板</small></span></Link>
          <Link to="/reports" className="dashboard-action"><Icon name="report" size={36} /><span><strong>新建报告</strong><small>选择模板并生成报告</small></span></Link>
          <Link to="/ledger" className="dashboard-action"><Icon name="ledger" size={36} /><span><strong>查看评估台账</strong><small>管理全部评估记录</small></span></Link>
        </div>
      </>}
    </div>
  );
}
