'use client';

import { Bell, History, MessageSquare, Users, LayoutDashboard, LogOut, Moon, Package, Settings, Sparkles, Sun, Truck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useSignedInAs } from '@/components/auth/Gate';
import { SignOutButton } from '@/components/auth/SignOut';
import { useAcks } from '@/lib/acks';
import { useAttention } from '@/lib/attention';
import { useUnreadMessages } from '@/lib/messages';
import { useConfig } from '@/lib/config';
import { setThemePref, useThemePref } from '@/lib/theme';
import { CopilotDrawer } from './CopilotDrawer';

/**
 * Every /console page sits in this frame: a dark border round the edge, the sidebar on the left
 * (brand, Copilot, pages, theme, who's signed in) and the page in a rounded panel. Below 900 px the
 * sidebar folds into a bar across the top. Ctrl K (⌘K) opens the Copilot from anywhere in here.
 */

const NAV: { href: string; label: string; icon: typeof Truck; exact?: boolean }[] = [
  { href: '/console/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/console', label: 'Deliveries', icon: Package, exact: true },
  { href: '/console/fleet', label: 'Fleet', icon: Truck },
  { href: '/console/drivers', label: 'Drivers', icon: Users },
  { href: '/console/history', label: 'History', icon: History },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

/** The two-dot mark from the design, on a white tile. */
export function BrandMark({ size = 38, tile = '#fff' }: { size?: number; tile?: string }) {
  const dot = Math.round(size * 0.37);
  const box = Math.round(size * 0.58);
  return (
    <span aria-hidden="true" className="grid flex-none place-items-center" style={{ width: size, height: size, borderRadius: size * 0.29, background: tile }}>
      <span className="relative block" style={{ width: box, height: box }}>
        <i className="absolute start-0 top-0 rounded-full bg-brand" style={{ width: dot, height: dot }} />
        <i className="absolute end-0 bottom-0 rounded-full bg-brand opacity-75" style={{ width: dot, height: dot }} />
      </span>
    </span>
  );
}

function useDark(): boolean {
  const pref = useThemePref();
  const [sys, setSys] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSys(mq.matches);
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'dark' || (pref === 'system' && sys);
}

const sideBtn = (on: boolean) =>
  `flex min-h-11 w-full items-center gap-3 rounded-xl border-0 px-3 text-start text-[14px] no-underline transition-colors ${
    on ? 'bg-[var(--side-hover)]' : 'bg-transparent hover:bg-[var(--side-hover)]'
  }`;

export function ConsoleShell({ children }: { children: ReactNode }) {
  const config = useConfig();
  const me = useSignedInAs();
  const path = usePathname() ?? '/console';
  const dark = useDark();
  const [copilot, setCopilot] = useState(false);
  // Whether the chat has opened yet: the button only rocks back down after it has gone up once.
  const [fabMoved, setFabMoved] = useState(false);
  useEffect(() => {
    if (copilot) setFabMoved(true);
  }, [copilot]);
  const agent = config.agent_enabled;
  const { rows } = useAttention();
  const acks = useAcks();
  const unread = rows.filter((x) => !acks.has(x.key)).length;
  const msgUnread = useUnreadMessages();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && agent) {
        e.preventDefault();
        setCopilot((o) => !o);
      }
    };
    // Other parts of the console (the Overview) can open it too.
    const onOpen = () => agent && setCopilot(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('copilot-open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('copilot-open', onOpen);
    };
  }, [agent]);

  const isOn = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));

  const themeSeg = (
    <div className="flex rounded-[14px] bg-[var(--side-hover)] p-1">
      {(
        [
          ['light', 'Light', Sun],
          ['dark', 'Dark', Moon],
        ] as const
      ).map(([k, label, Icon]) => {
        const on = (k === 'dark') === dark;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => setThemePref(k)}
            className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[10px] border-0 px-2 text-[13px]"
            style={{ background: on ? '#2e2e2e' : 'transparent', color: on ? '#fff' : 'var(--side-muted)', minHeight: 36 }}
          >
            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex h-dvh flex-col gap-3 overflow-hidden bg-frame p-3 text-ink min-[900px]:flex-row">
      {/* ---- Sidebar (wide) ---- */}
      <aside className="hidden w-[220px] flex-none flex-col gap-[22px] overflow-y-auto px-1 py-1.5 min-[900px]:flex" style={{ color: 'var(--side-text)' }}>
        <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--side-hover)] p-2.5">
          <BrandMark />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-semibold">{config.operator_name}</span>
            <span className="text-[11px]" style={{ color: 'var(--side-muted)' }}>
              Dispatch
            </span>
          </div>
        </div>
        <nav aria-label="Dispatch" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const on = isOn(href, exact);
            return (
              <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={sideBtn(on)} style={{ color: on ? 'var(--brand)' : 'var(--side-text)' }}>
                <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="h-px bg-[var(--side-hover)]" />
        <nav aria-label="Alerts" className="flex flex-col gap-1">
          <Link
            href="/console/notifications"
            aria-current={isOn('/console/notifications') ? 'page' : undefined}
            className={sideBtn(isOn('/console/notifications'))}
            style={{ color: isOn('/console/notifications') ? 'var(--brand)' : 'var(--side-text)' }}
          >
            <Bell size={18} strokeWidth={1.6} aria-hidden="true" />
            <span className="flex-1">Notifications</span>
            {unread > 0 && (
              <span aria-label={`${unread} unread`} className="grid h-5 min-w-5 place-items-center rounded-md bg-brand px-1.5 text-[11px] font-semibold text-brand-ink">
                {unread}
              </span>
            )}
          </Link>
          <Link
            href="/console/messages"
            aria-current={isOn('/console/messages') ? 'page' : undefined}
            className={sideBtn(isOn('/console/messages'))}
            style={{ color: isOn('/console/messages') ? 'var(--brand)' : 'var(--side-text)' }}
          >
            <MessageSquare size={18} strokeWidth={1.6} aria-hidden="true" />
            <span className="flex-1">Messages</span>
            {msgUnread > 0 && (
              <span aria-label={`${msgUnread} unread`} className="grid h-5 min-w-5 place-items-center rounded-md bg-brand px-1.5 text-[11px] font-semibold text-brand-ink">
                {msgUnread}
              </span>
            )}
          </Link>
        </nav>
        <div className="mt-auto flex flex-col gap-2.5">
          <Link
            href="/console/settings"
            aria-current={isOn('/console/settings') ? 'page' : undefined}
            className={sideBtn(isOn('/console/settings'))}
            style={{ color: isOn('/console/settings') ? 'var(--brand)' : 'var(--side-text)' }}
          >
            <Settings size={18} strokeWidth={1.6} aria-hidden="true" />
            Settings
          </Link>
          {themeSeg}
          <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--side-hover)] p-2.5">
            <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-[#2b2b2b] text-[13px] font-semibold text-white">{initials(me.name)}</span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[14px] font-semibold">{me.name}</span>
              <span className="text-[11px]" style={{ color: 'var(--side-muted)' }}>
                Dispatcher
              </span>
            </div>
            <SignOutButton iconOnly className="grid place-items-center rounded-lg border-0 bg-transparent text-[var(--side-muted)] hover:bg-black/30">
              <LogOut size={18} strokeWidth={1.6} aria-hidden="true" />
            </SignOutButton>
          </div>
        </div>
      </aside>

      {/* ---- Top bar (narrow) ---- */}
      <header className="flex flex-none flex-wrap items-center gap-2 min-[900px]:hidden" style={{ color: 'var(--side-text)' }}>
        <BrandMark size={34} />
        <span className="me-auto truncate text-[15px] font-semibold">{config.operator_name}</span>
        <button
          type="button"
          onClick={() => setThemePref(dark ? 'light' : 'dark')}
          aria-label={dark ? 'Light mode' : 'Dark mode'}
          className="grid h-11 w-11 place-items-center rounded-xl border-0 bg-[var(--side-hover)] text-[var(--side-text)]"
        >
          {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
        </button>
        <nav aria-label="Dispatch" className="flex w-full gap-1 overflow-x-auto">
          {[...NAV, { href: '/console/notifications', label: unread ? `Notifications · ${unread}` : 'Notifications', icon: Bell, exact: false }, { href: '/console/messages', label: msgUnread ? `Messages · ${msgUnread}` : 'Messages', icon: MessageSquare, exact: false }, { href: '/console/settings', label: 'Settings', icon: Settings, exact: false }].map(({ href, label, exact }) => {
            const on = isOn(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className="inline-flex min-h-10 flex-none items-center rounded-[10px] px-3 text-[13px] font-medium no-underline"
                style={{ background: on ? 'var(--side-hover)' : 'transparent', color: on ? 'var(--brand)' : 'var(--side-text)' }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="console-panel relative min-h-0 min-w-0 flex-1 overflow-auto rounded-[22px] bg-surface-100">{children}</main>

      {agent && <CopilotDrawer open={copilot} onClose={() => setCopilot(false)} />}
      {/* The round button in the corner: it rocks up and away as the chat opens, and rocks back
          down when it closes. (The sidebar's Copilot button stays where it is.) */}
      {agent && (
        <button
          type="button"
          onClick={() => setCopilot(true)}
          aria-label="Open Copilot (Ctrl K)"
          aria-hidden={copilot}
          tabIndex={copilot ? -1 : 0}
          title="Copilot · Ctrl K"
          className={`copilot-fab fixed end-6 bottom-6 z-[2900] grid h-14 w-14 place-items-center rounded-full border-0 bg-brand text-brand-ink ${
            copilot ? 'copilot-fab-up' : fabMoved ? 'copilot-fab-down' : ''
          }`}
          style={{ boxShadow: '0 10px 28px rgb(0 0 0 / 0.28), 0 0 0 3px rgb(255 255 255 / 0.9)' }}
        >
          <Sparkles size={24} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
