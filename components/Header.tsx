'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, Menu, Moon, Sun, UserCircle } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { useSidebar } from './SidebarContext';
import { api } from '@/lib/client';
import styles from './Header.module.css';

interface Me {
  Usuario: string;
}

export default function Header() {
  const { theme, toggle } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const router = useRouter();
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
    <header className={`${styles.header} glass`}>
      <div className={styles.left}>
        <button className="btn-icon" onClick={toggleSidebar} aria-label="Menú">
          <Menu size={22} />
        </button>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <KeyRound size={18} />
          </span>
          <span>
            HL Servidor
            <span className={styles.brandSub}>Administrador de llaves de IA</span>
          </span>
        </div>
      </div>
      <div className={styles.right}>
        <div className={styles.user}>
          <UserCircle size={18} />
          <span>{me?.Usuario ?? '...'}</span>
        </div>
        <button className="btn-icon" onClick={toggle} aria-label="Cambiar tema">
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <button className="btn-icon" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut size={20} />
        </button>
      </div>
    </header>
  );
}
