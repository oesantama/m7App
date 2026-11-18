import React, { useCallback, useRef, useState } from 'react';
import ConfirmModal, { ConfirmModalProps } from '../shared/ConfirmModal';

export type ConfirmOptions = Pick<
  ConfirmModalProps,
  'title' | 'subtitle' | 'message' | 'badge' | 'infoBox' | 'confirmText' | 'cancelText' | 'variant' | 'icon'
>;

/**
 * Reemplazo de window.confirm con el modal del sistema.
 * Uso: const { confirmar, confirmDialog } = useConfirmDialog();
 *      if (!(await confirmar({ title: '...', message: '...' }))) return;
 * y renderizar {confirmDialog} una vez en el JSX del componente.
 */
export function useConfirmDialog() {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirmar = useCallback((opts: ConfirmOptions) => {
    resolverRef.current?.(false);
    setOpciones(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const cerrar = useCallback((valor: boolean) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpciones(null);
  }, []);

  const confirmDialog = (
    <ConfirmModal
      isOpen={!!opciones}
      onClose={() => cerrar(false)}
      onConfirm={() => cerrar(true)}
      title={opciones?.title || ''}
      subtitle={opciones?.subtitle}
      message={opciones?.message}
      badge={opciones?.badge}
      infoBox={opciones?.infoBox}
      confirmText={opciones?.confirmText}
      cancelText={opciones?.cancelText}
      variant={opciones?.variant}
      icon={opciones?.icon}
    />
  );

  return { confirmar, confirmDialog };
}

/** Fila "etiqueta: valor" para el cuerpo del modal de confirmación. */
export const FilaConfirm: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800 last:border-0 text-left">
    <span className="text-slate-400 text-xs font-bold uppercase tracking-wide">{label}</span>
    <span className="text-white text-sm font-bold text-right">{value}</span>
  </div>
);
