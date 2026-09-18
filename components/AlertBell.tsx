'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { api } from '@/lib/client';

/** Cada cuanto se pregunta por alertas sin leer. */
const INTERVALO_MS = 60_000;

/** Campana de la cabecera: alertas sin leer, enlaza a /alertas. */
export default function AlertBell() {
  const [noLeidas, setNoLeidas] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      const r = await api<{ noLeidas: number }>('/api/alertas?conteo=1');
      if (vivo && r.success && r.data) setNoLeidas(r.data.noLeidas);
    };
    void traer();
    const id = setInterval(() => void traer(), INTERVALO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [pathname]);

  return (
    <Link href="/alertas" className="btn-icon bell" aria-label={noLeidas ? `${noLeidas} alertas sin leer` : 'Alertas'} title="Alertas">
      <Bell size={20} />
      {noLeidas > 0 && <span className="bell-badge">{noLeidas > 99 ? '99+' : noLeidas}</span>}
    </Link>
  );
}
