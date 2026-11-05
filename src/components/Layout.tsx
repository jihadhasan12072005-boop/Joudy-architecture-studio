import { NavLink, Outlet, Link } from 'react-router-dom';
import { Icon } from './Icon';
import { BrandMark } from './ArchArt';
import { useOnline } from '../lib/hooks';
import { UpdateBanner } from './UpdateBanner';

const NAV = [
  { to: '/', icon: 'home', label: 'الرئيسية', end: true },
  { to: '/projects', icon: 'folder', label: 'المشاريع' },
  { to: '/tools', icon: 'compass', label: 'الأدوات الهندسية' },
  { to: '/academy', icon: 'book', label: 'المواد الدراسية' },
  { to: '/mistakes', icon: 'notebook', label: 'دفتر الأخطاء' },
  { to: '/assistant', icon: 'spark', label: 'المساعد الذكي' },
];

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Joudy Architecture Studio — الرئيسية">
      <BrandMark className="brand-mark" />
      <span>
        <span className="brand-name">استوديو جودي</span>
        <br />
        <span className="brand-sub">Joudy Architecture Studio</span>
      </span>
    </Link>
  );
}

export function Layout() {
  const online = useOnline();
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="القائمة الرئيسية">
        <Brand />
        <div className="nav-label">الاستوديو</div>
        {NAV.slice(0, 3).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <div className="nav-label">الدراسة</div>
        {NAV.slice(3).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <div className="sidebar-foot stack sm">
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon name="settings" />
            الإعدادات والنسخ الاحتياطي
          </NavLink>
          {!online && (
            <span className="badge warn" style={{ alignSelf: 'flex-start' }}>
              <Icon name="wifioff" size={13} /> بدون إنترنت — كل شيء محفوظ محلياً
            </span>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="mobile-top">
          <Brand />
          <div className="row" style={{ gap: 6 }}>
            {!online && <span className="badge warn"><Icon name="wifioff" size={13} />غير متصل</span>}
            <NavLink to="/mistakes" className="btn ghost icon" aria-label="دفتر الأخطاء"><Icon name="notebook" /></NavLink>
            <NavLink to="/settings" className="btn ghost icon" aria-label="الإعدادات"><Icon name="settings" /></NavLink>
          </div>
        </header>
        <UpdateBanner />
        <Outlet />
      </div>

      <nav className="mobile-nav" aria-label="التنقل">
        {[NAV[0], NAV[1], NAV[2], NAV[3], NAV[5]].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={n.icon} />
            {n.label.replace('الأدوات الهندسية', 'الأدوات').replace('المواد الدراسية', 'المواد').replace('المساعد الذكي', 'المساعد')}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
