'use client';

import { Check } from 'lucide-react';
import ProviderMark from './ProviderMark';
import { PROVIDERS, providerProxyHint, type ProviderId } from '@/lib/providers';

interface ProviderPickerProps {
  value: ProviderId;
  onChange: (id: ProviderId) => void;
}

/** Selector visual de proveedor: una loseta por proveedor con su glifo y color de marca. */
export default function ProviderPicker({ value, onChange }: ProviderPickerProps) {
  return (
    <div>
      <div className="ppick" role="radiogroup" aria-label="Proveedor de IA">
        {PROVIDERS.map((p) => {
          const active = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`ppick-tile ${active ? 'active' : ''}`}
              style={{ '--brand': p.color } as React.CSSProperties}
              onClick={() => onChange(p.id)}
            >
              <ProviderMark id={p.id} size={30} />
              <span className="ppick-name">{p.short}</span>
              {active && <span className="ppick-check"><Check size={12} /></span>}
            </button>
          );
        })}
      </div>
      <span className="form-hint">{providerProxyHint(value)}</span>
    </div>
  );
}
