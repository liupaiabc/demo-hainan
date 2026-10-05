import { Layout } from 'antd';
import { NavLink, Outlet, Route, Routes } from 'react-router';
import TemplatePage from './pages/TemplatePage';
import LedgerPage from './pages/LedgerPage';
import ReportPage from './pages/ReportPage';
import NotFoundPage from './pages/NotFoundPage';
import { Icon } from './components/Icon';

const { Sider, Header, Content } = Layout;

const navigation = [
  { to: '/', label: '首页仪表盘', icon: 'dashboard' },
  { to: '/templates', label: '报告模板管理', icon: 'template' },
  { to: '/reports', label: '报告生成', icon: 'report' },
  { to: '/ledger', label: '评估台账', icon: 'ledger' },
] as const;

function AppLayout() {
  return (
    <Layout className="app-shell">
      <Sider className="app-sidebar" width={250} breakpoint="lg" collapsedWidth="0">
        <div className="sidebar-brand">PIA评估平台</div>
        <nav className="sidebar-nav" aria-label="主导航">
          {navigation.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </Sider>
      <Layout className="main-layout">
        <Header className="app-header">PIA评估平台</Header>
        <Content className="app-content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}

function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="page-wrap">
      <div className="breadcrumb">首页 <span>/</span> {title}</div>
      <section className="page-card empty-page">
        <h1>{title}</h1>
        <p>页面即将开放</p>
      </section>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<ComingSoonPage title="首页仪表盘" />} />
        <Route path="templates" element={<TemplatePage />} />
        <Route path="reports" element={<ReportPage />} />
        <Route path="ledger" element={<LedgerPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
