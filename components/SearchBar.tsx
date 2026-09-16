'use client';

import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Registros en total y los que quedan tras filtrar, para el contador "n de m". */
  total: number;
  visibles: number;
  /** Nombre del registro para el contador: ["llave", "llaves"]. */
  nombre: [string, string];
}

/** Barra de busqueda incremental de las listas, con contador y boton para limpiar. */
export default function SearchBar({ value, onChange, placeholder, total, visibles, nombre }: SearchBarProps) {
  const filtrando = value.trim() !== '';
  const contador = filtrando ? `${visibles} de ${total}` : `${total} ${total === 1 ? nombre[0] : nombre[1]}`;

  return (
    <div className="card toolbar">
      <div className="filters-row">
        <div className="form-group" style={{ flex: '1 1 320px' }}>
          <label>Buscar</label>
          <div className="search-box">
            <Search size={16} />
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off" />
            {value && (
              <button type="button" className="btn-icon" onClick={() => onChange('')} aria-label="Limpiar búsqueda" title="Limpiar">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="form-group narrow">
          <label>&nbsp;</label>
          <span className="form-hint" style={{ minHeight: '2.4rem', display: 'inline-flex', alignItems: 'center' }}>{contador}</span>
        </div>
      </div>
    </div>
  );
}

/** Fila de tabla para cuando hay registros pero ninguno coincide con la busqueda. */
export function SinCoincidencias({ consulta, columnas }: { consulta: string; columnas: number }) {
  return (
    <tr>
      <td colSpan={columnas} className="empty">Nada coincide con &ldquo;{consulta.trim()}&rdquo;.</td>
    </tr>
  );
}
