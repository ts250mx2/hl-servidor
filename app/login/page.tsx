'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { api } from '@/lib/client';
import styles from './login.module.css';

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
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className={`${styles.card} glass animate-scale`}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>
            <KeyRound size={28} />
          </span>
          <span className={styles.title}>HL Servidor</span>
          <p className={styles.subtitle}>Administrador de llaves de IA</p>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej: admin"
              autoComplete="username"
              required
              autoFocus
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Iniciando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
