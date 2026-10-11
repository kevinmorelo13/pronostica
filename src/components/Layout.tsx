import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Bell, Menu, Shield, X } from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationsContext';
import NotificationsPanel from './NotificationsPanel';

const NAV_ITEMS = [
  { to: '/', label: 'Inicio' },
  { to: '/predicciones', label: 'Pronósticos' },
  { to: '/combinadas', label: 'Combinadas' },
  { to: '/reto-escalera', label: 'Reto escalera' },
  { to: '/en-vivo', label: 'En vivo' },
  { to: '/calendario', label: 'Calendario' },
  { to: '/estadisticas', label: 'Estadísticas' },
  { to: '/clasificaciones', label: 'Ligas' },
  { to: '/historial', label: 'Historial' },
  { to: '/modelos', label: 'Modelos' },
  { to: '/admin', label: 'Admin' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { unreadCount } = useNotifications();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#ededeb] text-[#171717]">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#ededeb]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-6 px-5 lg:px-10">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setMenuOpen(false)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c7ff00]"><Shield size={16} /></span>
            <span className="text-sm font-black tracking-[-0.04em]">FUTBOL PREDICTOR</span>
          </NavLink>
          <nav className="hidden flex-1 items-center justify-center gap-5 lg:flex">
            {NAV_ITEMS.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `text-[11px] font-bold uppercase tracking-[0.08em] transition ${isActive ? 'text-black' : 'text-neutral-500 hover:text-black'}`}>{item.label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/configuracion" className="hidden rounded-full border border-black/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] transition hover:bg-white sm:inline-flex">Ajustes <ArrowUpRight size={12} className="ml-1" /></NavLink>
            <div className="relative">
              <button onClick={() => setNotifOpen((value) => !value)} className="relative rounded-full border border-black/15 bg-white p-2 transition hover:border-black"><Bell size={16} />{unreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c7ff00] px-1 text-[9px] font-black">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>
              {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
            </div>
            <button className="rounded-full border border-black/15 bg-white p-2 lg:hidden" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={17} /> : <Menu size={17} />}</button>
          </div>
        </div>
        {menuOpen && <nav className="border-t border-black/10 bg-[#ededeb] px-5 py-4 lg:hidden">{NAV_ITEMS.map((item) => <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setMenuOpen(false)} className={({ isActive }) => `block border-b border-black/10 py-3 text-xs font-bold uppercase tracking-[0.08em] ${isActive ? 'text-black' : 'text-neutral-500'}`}>{item.label}</NavLink>)}</nav>}
      </header>
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <div className="pointer-events-none fixed bottom-5 right-5 hidden rounded-full bg-[#c7ff00] px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] shadow-lg sm:block">{NAV_ITEMS.find((item) => item.to === location.pathname)?.label ?? 'Inicio'}</div>
    </div>
  );
}
