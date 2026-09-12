'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import ProviderMark from '@/components/ProviderMark';
import { PROVIDERS } from '@/lib/providers';
import { api } from '@/lib/client';
import styles from './login.module.css';

const SHOWCASE_PROVIDERS = PROVIDERS.filter((p) => p.id !== 'otro');

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { theme, toggle } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.success) {
      router.push('/');
      router.refresh();
    } else {
      setError(res.error || 'Error al iniciar sesión');
    }
  };

  return (
    <div className={styles.container}>
      <button className={styles.themeToggle} onClick={toggle} aria-label="Cambiar tema">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <aside className={styles.showcase}>
        <div className={styles.orb} aria-hidden="true" />
        <div className={styles.brand}>
          <span className={styles.brandIcon}>HL</span>
          <span>HL <em>Console</em></span>
        </div>
        <div className={styles.tagline}>
          <span className={styles.eyebrow}>Llaves · agentes · proxy</span>
          <h1 className={styles.headline}>Una sola consola para <span>todas tus IAs</span>.</h1>
          <p className={styles.lead}>Las llaves viven cifradas aquí. Tus aplicaciones solo conocen un agente y reciben proveedor, modelo y llave al momento.</p>
        </div>
        <div className={styles.marks}>
          <span className={styles.marksLabel}>Proveedores soportados</span>
          {SHOWCASE_PROVIDERS.map((p) => <ProviderMark key={p.id} id={p.id} size={34} />)}
        </div>
      </aside>

      <section className={styles.formSide}>
        <div className={`${styles.card} animate-fade`}>
          <h2 className={styles.title}>Iniciar sesión</h2>
          <p className={styles.subtitle}>Ingresa tus credenciales del portal.</p>

          {error && <div className={styles.error}>{error}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Usuario</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej: admin" autoComplete="username" required autoFocus />
            </div>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Contraseña</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
            </div>
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Iniciando...' : 'Entrar a la consola'}
            </button>
          </form>
          <p className={styles.foot}>Acceso restringido · sesión firmada</p>
        </div>
      </section>
    </div>
  );
}
