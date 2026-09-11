'use client';

import { X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const subscribeNoop = () => () => {};

export default function Modal({ title, onClose, children }: ModalProps) {
  /* Solo hay document en el navegador; en SSR el modal no se renderiza. */
  const isBrowser = useSyncExternalStore(subscribeNoop, () => true, () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!isBrowser) return null;

  /* Portal al body: así position:fixed siempre es relativo a la ventana,
     sin importar transforms o filtros de los contenedores de la página. */
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal animate-scale" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
