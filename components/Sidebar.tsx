'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Bell, Bot, Coins, History, KeyRound, KeySquare, LayoutDashboard, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import styles from './Sidebar.module.css';

const GROUPS = [
  { title: 'General', links: [{ href: '/', label: 'Resumen', icon: LayoutDashboard }] },
  {
    title: 'Catálogo',
    links: [
      { href: '/llaves', label: 'Llaves de API', icon: KeySquare },
      { href: '/agentes', label: 'Agentes', icon: Bot },
      { href: '/precios', label: 'Precios', icon: Coins },
    ],
  },
  {
    title: 'Acceso',
    links: [
      { href: '/keys', label: 'Keys de acceso', icon: KeyRound },
      { href: '/ips', label: 'IPs permitidas', icon: ShieldCheck },
      { href: '/usuarios', label: 'Usuarios', icon: Users },
    ],
  },
  {
    title: 'Monitoreo',
    links: [
      { href: '/bitacora', label: 'Bitácora', icon: ScrollText },
      { href: '/estadisticas', label: 'Estadísticas', icon: BarChart3 },
      { href: '/auditoria', label: 'Auditoría', icon: History },
      { href: '/alertas', label: 'Alertas', icon: Bell },
    ],
  },
];

export default function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  return (
    <>
      {!collapsed && <div className={styles.overlay} onClick={toggle} />}
      <aside className={`${styles.sidebar} glass ${collapsed ? styles.collapsed : ''}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">HL</span>
          <span className={styles.brandName}>
            <span>HL <em>Console</em></span>
            <span className={styles.brandSub}>llaves · agentes · proxy</span>
          </span>
        </Link>

        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className={styles.section}>{group.title}</div>
            {group.links.map(({ href, label, icon: Icon }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ''}`}>
                  <Icon size={18} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}

        <div className={styles.footer}>
          <div className={styles.endpoint}><span>Llave</span><code>/api/ws/llave/&lt;uuid&gt;</code></div>
          <div className={styles.endpoint}><span>Proxy</span><code>/api/ws/proxy/&lt;uuid&gt;/…</code></div>
          <div className={styles.endpoint}><span>Header</span><code>X-HL-Key</code></div>
        </div>
      </aside>
    </>
  );
}
