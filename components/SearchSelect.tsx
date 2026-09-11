'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchOption {
  value: number;
  label: string;
  sublabel?: string;
  /** Texto adicional por el que tambien se busca (ej. proveedor, modelo). */
  keywords?: string;
  disabled?: boolean;
}

interface SearchSelectProps {
  options: SearchOption[];
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  emptyText?: string;
  /** Maximo de resultados a mostrar para que la lista siga siendo manejable. */
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 50;

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Busqueda incremental: coincide si todas las palabras escritas aparecen en label, sublabel o keywords. */
function matches(option: SearchOption, query: string): boolean {
  const haystack = normalize(`${option.label} ${option.sublabel ?? ''} ${option.keywords ?? ''}`);
  return normalize(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar...',
  emptyText = 'Sin resultados',
  maxResults = DEFAULT_MAX_RESULTS,
}: SearchSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = options.filter((o) => matches(o, query)).slice(0, maxResults);
  const totalMatches = options.filter((o) => matches(o, query)).length;

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const pick = (option: SearchOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(0);
    setQuery('');
    setOpen(true);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showSelected = selected && !open;

  return (
    <div className="ss-root" ref={rootRef}>
      <div className={`ss-control ${open ? 'ss-open' : ''}`} onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <Search size={16} className="ss-icon" />
        {showSelected ? (
          <div className="ss-selected">
            <span className="ss-label">{selected.label}</span>
            {selected.sublabel && <span className="ss-sublabel">{selected.sublabel}</span>}
          </div>
        ) : (
          <input
            ref={inputRef}
            className="ss-input"
            value={query}
            placeholder={selected ? selected.label : placeholder}
            onChange={(e) => { setQuery(e.target.value); setHighlight(0); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
          />
        )}
        {selected ? (
          <button type="button" className="btn-icon ss-clear" onClick={(e) => { e.stopPropagation(); clear(); }} aria-label="Quitar selección">
            <X size={15} />
          </button>
        ) : (
          <ChevronDown size={16} className="ss-icon" />
        )}
      </div>

      {open && (
        <div className="ss-menu" id={listId} role="listbox">
          {filtered.length === 0 && <div className="ss-empty">{emptyText}</div>}
          {filtered.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`ss-item ${i === highlight ? 'ss-highlight' : ''} ${o.disabled ? 'ss-disabled' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
            >
              <div>
                <div className="ss-label">{o.label}</div>
                {o.sublabel && <div className="ss-sublabel">{o.sublabel}</div>}
              </div>
              {o.value === value && <Check size={15} />}
            </div>
          ))}
          {totalMatches > filtered.length && (
            <div className="ss-empty">Mostrando {filtered.length} de {totalMatches}. Escribe más para afinar.</div>
          )}
        </div>
      )}
    </div>
  );
}
