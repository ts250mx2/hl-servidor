'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, KeyRound, KeySquare, LayoutDashboard, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import styles from './Sidebar.module.css';

const LINKS = [
  { href: '/', label: 'Resumen', icon: LayoutDashboard },
  { href: '/llaves', label: 'Llaves de API', icon: KeySquare },
  { href: '/agentes', label: 'Agentes', icon: Bot },
  { href: '/keys', label: 'Keys de acceso', icon: KeyRound },
  { href: '/ips', label: 'IPs permitidas', icon: ShieldCheck },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/bitacora', label: 'Bitácora', icon: ScrollText },
];

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  return (
    <>
      {!collapsed && <div className={styles.overlay} onClick={toggle} />}
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.section}>Administración</div>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
        <div className={styles.footer}>
          Webservice: <code>/api/ws/llave</code>
          <br />
          Header: <code>X-HL-Key</code>
        </div>
      </aside>
    </>
  );
}
