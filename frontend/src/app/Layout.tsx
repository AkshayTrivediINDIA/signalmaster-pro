import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MODULES } from './registry';
import { Icon } from '../components/ui/icons';
import { HelpPanel } from './HelpPanel';
import { CommandMenu } from './CommandMenu';
import { SettingsDialog } from './SettingsDialog';
import { useTheme } from '../hooks/useTheme';
import { useEngineStatus } from './AppContext';
import { recordRecent } from '../services/storage';
import { useToast } from '../components/ui/feedback';

const GROUPS: Array<'Workspace' | 'Transforms' | 'Learning'> = ['Workspace', 'Transforms', 'Learning'];

/** Project credits, shown in the sidebar footer. */
const AUTHORS = [
  'Akshay Trivedi',
  'Prakhar Srivatsva',
  'Shubham Srivastava',
  'Shaikh Salman',
  'Ashish Kharwar',
] as const;


/**
 * Application shell: collapsible sidebar, sticky top bar with global search,
 * help access, theme switch and settings, plus the routed workspace.
 * The sidebar collapses to icons on tablet and becomes a slide-over on mobile.
 */
export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { status } = useEngineStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (mod && e.key === '/') {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    const m = MODULES.find((x) => x.path === location.pathname);
    if (m) recordRecent(m.path, m.title);
    else if (location.pathname === '/') recordRecent('/', 'Dashboard');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  const current = MODULES.find((m) => m.path === location.pathname);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to main content
      </a>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-surface transition-[width,transform] duration-200 no-print
          ${collapsed ? 'w-[60px]' : 'w-[232px]'}
          ${mobileOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-2.5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-w-0 items-center gap-2 text-left"
            aria-label="SignalMaster Pro home"
          >
            <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[4px] bg-brand text-white">
              <Icon name="wave" size={15} strokeWidth={2.2} />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold leading-4 tracking-[-0.01em] text-ink">SignalMaster Pro</span>
                <span className="block truncate text-[10px] leading-3 text-muted">Analysis workbench</span>
              </span>
            )}
          </button>
          <button
            type="button"
            className="btn-icon ml-auto hidden lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={16} />
          </button>
          <button type="button" className="btn-icon ml-auto lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
            <Icon name="close" size={16} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-3 pt-2.5" aria-label="Primary navigation">
          <div>
            <NavItem to="/" icon="dashboard" label="Dashboard" collapsed={collapsed} end />
          </div>
          {GROUPS.map((g) => (
            <div key={g}>
              {!collapsed && <p className="eyebrow mb-1 px-2">{g}</p>}
              {collapsed && <div className="mx-2 mb-1.5 border-t border-line" aria-hidden="true" />}
              <div className="space-y-px">
                {MODULES.filter((m) => m.group === g).map((m) => (
                  <NavItem key={m.id} to={m.path} icon={m.icon} label={m.title} collapsed={collapsed} short={m.short} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-2 py-2">
          <div className={`pb-2 ${collapsed ? 'flex justify-center' : 'px-1.5'}`}>
            {collapsed ? (
              <span
                className="text-muted"
                title={`Developed by ${AUTHORS.join(', ')}`}
                aria-label={`Developed by ${AUTHORS.join(', ')}`}
              >
                <Icon name="users" size={14} />
              </span>
            ) : (
              <>
                <p className="eyebrow mb-1">Developed by</p>
                <ul className="space-y-px text-[10.5px] leading-[1.4] text-muted">
                  {AUTHORS.map((name) => (
                    <li key={name} className="truncate" title={name}>
                      {name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className={`flex items-center gap-2 border-t border-line px-1.5 pt-2 text-[11px] ${collapsed ? 'justify-center' : ''}`} title={`Symbolic engine: ${status}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'online' ? 'bg-ok' : status === 'checking' ? 'bg-warn' : 'bg-muted'}`} aria-hidden="true" />
            {!collapsed && (
              <span className="truncate text-muted">
                Engine <span className="text-ink">{status === 'online' ? 'online' : status === 'checking' ? 'checking…' : 'offline'}</span>
              </span>
            )}
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

      {/* Main column */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? 'lg:pl-[60px]' : 'lg:pl-[232px]'}`}>
        <header className="sticky top-0 z-20 flex h-12 items-center gap-1.5 border-b border-line bg-surface/90 px-2.5 backdrop-blur sm:px-3.5 no-print">
          <button type="button" className="btn-icon lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Icon name="menu" size={17} />
          </button>

          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group flex h-[30px] w-full max-w-sm items-center gap-2 rounded-[4px] border border-line bg-surface px-2 text-left text-[12px] text-muted transition hover:border-line-strong hover:text-ink"
            aria-label="Open global search (Ctrl+K)"
          >
            <Icon name="search" size={13} />
            <span className="truncate">Search tools, formulas, topics</span>
            <span className="ml-auto hidden items-center gap-0.5 sm:flex">
              <span className="kbd">Ctrl</span>
              <span className="kbd">K</span>
            </span>
          </button>

          <div className="ml-auto flex items-center gap-0.5">
            <button type="button" className="btn-icon" onClick={() => setHelpOpen(true)} aria-label="Open help for this page" title="Help (Ctrl+/)">
              <Icon name="help" size={16} />
            </button>
            <button type="button" className="btn-icon" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
            <button type="button" className="btn-icon" onClick={() => setSettingsOpen(true)} aria-label="Open settings" title="Settings">
              <Icon name="settings" size={16} />
            </button>
          </div>
        </header>

        <main id="main" className="flex-1 px-3 py-3.5 sm:px-4 sm:py-4 lg:px-6">
          <div className="mx-auto w-full max-w-[1440px]">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-3 py-2 text-[10.5px] text-muted no-print sm:px-4">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p>
              SignalMaster Pro 1.0.0 · open source · calculations run locally in your browser
              {current ? ` · ${current.title}` : ''}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <button type="button" className="hover:text-ink hover:underline" onClick={() => setHelpOpen(true)}>
                Help &amp; conventions
              </button>
              <button
                type="button"
                className="hover:text-ink hover:underline"
                onClick={() => {
                  toast.push('Educational tool — always verify critical results independently.', 'info');
                }}
              >
                Disclaimer
              </button>
            </p>
          </div>
        </footer>
      </div>

      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  short,
  collapsed,
  end = false,
}: {
  to: string;
  icon: string;
  label: string;
  short?: string;
  collapsed: boolean;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
      title={collapsed ? label : short ?? undefined}
    >
      <Icon name={icon} size={15} className="shrink-0" strokeWidth={1.8} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
