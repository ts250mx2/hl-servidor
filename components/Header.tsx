'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useSidebar } from './SidebarContext';
import { api } from '@/lib/client';
import styles from './Header.module.css';

interface Me {
  Usuario: string;
}

const TITLES: Record<string, string> = {
  '/': 'Resumen',
  '/llaves': 'Llaves de API',
  '/agentes': 'Agentes',
  '/keys': 'Keys de acceso',
  '/ips': 'IPs permitidas',
  '/usuarios': 'Usuarios',
  '/bitacora': 'Bitácora',
  '/estadisticas': 'Estadísticas',
};

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function titleFor(pathname: string): string {
  const key = Object.keys(TITLES).find((k) => (k === '/' ? pathname === '/' : pathname.startsWith(k)));
  return key ? TITLES[key] : 'Consola';
}

export default function Header() {
  const { theme, toggle } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>('/api/auth/me').then((r) => {
      if (r.success && r.data) setMe(r.data);
    });
  }, []);

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button className="btn-icon" onClick={toggleSidebar} aria-label="Menú">
          <Menu size={22} />
        </button>
        <div className={styles.crumb}>
          <span className={styles.crumbRoot}>HL Console</span>
          <span className={styles.crumbSep}>/</span>
          <span className={styles.crumbCurrent}>{titleFor(pathname)}</span>
        </div>
      </div>
      <div className={styles.right}>
        <span className={styles.status} title="Webservice y proxy en línea">
          <span className={styles.dot} /> En línea
        </span>
        <div className={styles.user} title={me?.Usuario ?? ''}>
          <span className={styles.avatar}>{me ? initials(me.Usuario) : '·'}</span>
          <span>{me?.Usuario ?? '...'}</span>
        </div>
        <button className="btn-icon" onClick={toggle} aria-label="Cambiar tema" title="Cambiar tema">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="btn-icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
