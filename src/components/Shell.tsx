'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Repeat2, LayoutDashboard, Handshake, Wallet, TrendingUp, CalendarRange,
  Users, ScrollText, Bot, Sun, Moon, LogOut, Menu, Search, UserCog, PhoneCall, Headphones,
} from 'lucide-react';
import { logoutAction } from '@/actions/auth';

export type ShellUser = {
  displayName: string;
  roleLabel: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};

function initial(name: string) {
  const s = (name || '').trim();
  return s ? s[0].toUpperCase() : '?';
}

export default function Shell({
  user,
  today,
  children,
}: {
  user: ShellUser;
  today: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setDark(document.documentElement.dataset.theme !== 'light');
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/barterlar') {
      setQ('');
      return;
    }
    try {
      setQ(new URL(window.location.href).searchParams.get('q') || '');
    } catch {
      setQ('');
    }
  }, [pathname]);

  function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode */
    }
    setDark(!dark);
    document.dispatchEvent(new CustomEvent('themechange'));
  }

  const is = (...prefixes: string[]) =>
    prefixes.some((p) => (p === '/' ? pathname === '/' : pathname.startsWith(p)));

  return (
    <div className="app">
      <aside className="sidebar" id="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Repeat2 className="lucide" />
          </span>
          <span>
            <b>TXT Barter</b>
            <small>by Ezzyjon</small>
          </span>
        </Link>

        <nav className="nav">
          <div className="nav-group">Asosiy</div>
          <Link href="/" className={is('/') ? 'active' : ''}>
            <LayoutDashboard className="lucide" />
            Dashboard
          </Link>
          <Link href="/barterlar" className={is('/barterlar') ? 'active' : ''}>
            <Handshake className="lucide" />
            Barterlar
          </Link>
          <Link href="/tolovlar" className={is('/tolovlar') ? 'active' : ''}>
            <Wallet className="lucide" />
            To&apos;lovlar
          </Link>

          <div className="nav-group">Tahlil</div>
          <Link href="/trend" className={is('/trend') ? 'active' : ''}>
            <TrendingUp className="lucide" />
            Trend va tahlil
          </Link>
          <Link href="/oylik-hisobot" className={is('/oylik-hisobot') ? 'active' : ''}>
            <CalendarRange className="lucide" />
            Oylik hisobot
          </Link>
          <Link href="/qongiroqlar" className={is('/qongiroqlar') ? 'active' : ''}>
            <PhoneCall className="lucide" />
            Qo&apos;ng&apos;iroqlar
          </Link>

          {user.isAdmin && (
            <>
              <div className="nav-group">Boshqaruv</div>
              <Link href="/foydalanuvchilar" className={is('/foydalanuvchilar') ? 'active' : ''}>
                <Users className="lucide" />
                Foydalanuvchilar
              </Link>
              <Link href="/audit" className={is('/audit') ? 'active' : ''}>
                <ScrollText className="lucide" />
                Audit log
              </Link>
              <Link href="/bot" className={is('/bot') ? 'active' : ''}>
                <Bot className="lucide" />
                Bot sozlamalari
              </Link>
              <Link href="/telefoniya" className={is('/telefoniya') ? 'active' : ''}>
                <Headphones className="lucide" />
                IP-telefoniya
              </Link>
            </>
          )}

          <div className="nav-group">Hisob</div>
          <Link href="/kabinet" className={is('/kabinet') ? 'active' : ''}>
            <UserCog className="lucide" />
            Mening kabinetim
          </Link>
        </nav>

        <div className="nav-bottom nav">
          <button type="button" className="nav-item" onClick={toggleTheme}>
            {dark ? <Sun className="lucide" /> : <Moon className="lucide" />}
            <span>{dark ? 'Oq rejim' : 'Qora rejim'}</span>
          </button>
          <form action={logoutAction}>
            <button type="submit" className="nav-item danger">
              <LogOut className="lucide" />
              Chiqish
            </button>
          </form>
          <Link className="user-card" href="/kabinet">
            <span className="avatar">{initial(user.displayName)}</span>
            <div>
              <b>{user.displayName}</b>
              <small>{user.roleLabel}</small>
            </div>
          </Link>
        </div>
      </aside>

      <button
        type="button"
        className="sidebar-overlay"
        aria-label="Menyuni yopish"
        onClick={() => setNavOpen(false)}
      />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-ghost icon menu-btn"
            aria-label="Menyu"
            onClick={() => setNavOpen((v) => !v)}
          >
            <Menu className="lucide" />
          </button>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const value = q.trim();
              // Barterlar sahifasida turgan bo'lsak, mavjud filtrlarni saqlaymiz
              const sp = new URLSearchParams(
                pathname === '/barterlar' ? window.location.search : '',
              );
              sp.delete('page');
              sp.delete('open');
              if (value) sp.set('q', value);
              else sp.delete('q');
              const qs = sp.toString();
              router.push(qs ? `/barterlar?${qs}` : '/barterlar');
            }}
          >
            <label className="search">
              <Search className="lucide" />
              <input
                type="search"
                name="q"
                placeholder="Barterchi, shartnoma yoki telefon…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </form>
          <span className="today">{today}</span>
        </header>

        <main className="content">
          {user.mustChangePassword && (
            <div className="banner">
              Xavfsizlik uchun boshlang&apos;ich parolni almashtiring —{' '}
              <Link href="/kabinet">Mening kabinetim</Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
