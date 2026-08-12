import React, { useEffect } from 'react';
import { Icons } from '../../constants';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  subtitle?: string;
  message?: React.ReactNode;
  badge?: {
    text: string;
    variant?: 'emerald' | 'amber' | 'blue' | 'rose' | 'slate';
  };
  infoBox?: {
    icon?: 'shield' | 'alert' | 'info' | 'mail' | 'lock';
    title?: string;
    text: string;
    variant?: 'emerald' | 'amber' | 'blue' | 'rose';
  };
  confirmText?: string;
  cancelText?: string;
  variant?: 'emerald' | 'danger' | 'warning' | 'info';
  icon?: 'mail' | 'trash' | 'shield' | 'alert' | 'send';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  subtitle,
  message,
  badge,
  infoBox,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'emerald',
  icon = 'shield',
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  // Icon rendering helper
  const renderIcon = () => {
    const iconClass = 'w-8 h-8';
    switch (icon) {
      case 'mail':
      case 'send':
        return <Icons.Mail className={iconClass} />;
      case 'trash':
        return <Icons.Trash className={iconClass} />;
      case 'alert':
        return <Icons.AlertTriangle className={iconClass} />;
      case 'shield':
      default:
        return <Icons.Shield className={iconClass} />;
    }
  };

  const renderInfoIcon = (infoIcon?: string) => {
    const c = 'w-4 h-4 flex-shrink-0';
    switch (infoIcon) {
      case 'shield':
        return <Icons.Shield className={c} />;
      case 'alert':
        return <Icons.AlertTriangle className={c} />;
      case 'mail':
        return <Icons.Mail className={c} />;
      case 'lock':
        return <Icons.Lock className={c} />;
      case 'info':
      default:
        return <Icons.Info className={c} />;
    }
  };

  // Color configurations based on variant
  const variantConfig = {
    emerald: {
      topBar: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500',
      iconBox: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/10 ring-emerald-500/10',
      confirmBtn: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25',
    },
    danger: {
      topBar: 'bg-gradient-to-r from-red-600 via-rose-500 to-orange-500',
      iconBox: 'bg-red-500/10 border-red-500/30 text-red-400 shadow-red-500/10 ring-red-500/10',
      confirmBtn: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-500/25',
    },
    warning: {
      topBar: 'bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500',
      iconBox: 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-amber-500/10 ring-amber-500/10',
      confirmBtn: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 shadow-amber-500/25',
    },
    info: {
      topBar: 'bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400',
      iconBox: 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-blue-500/10 ring-blue-500/10',
      confirmBtn: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/25',
    },
  }[variant];

  // InfoBox variant colors
  const infoBoxVariantClass = (infoVariant?: string) => {
    switch (infoVariant) {
      case 'rose':
        return 'bg-red-950/30 border-red-800/40 text-red-400';
      case 'amber':
        return 'bg-amber-950/30 border-amber-800/40 text-amber-400';
      case 'blue':
        return 'bg-blue-950/30 border-blue-800/40 text-blue-400';
      case 'emerald':
      default:
        return 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400';
    }
  };

  const badgeVariantClass = (badgeVariant?: string) => {
    switch (badgeVariant) {
      case 'rose':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'blue':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'slate':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'emerald':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[800] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => !isLoading && onClose()}
    >
      <div
        className="bg-slate-900 border border-slate-800/90 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl shadow-black/80 relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Color Bar */}
        <div className={`h-1.5 w-full ${variantConfig.topBar}`} />

        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors disabled:opacity-30"
          title="Cerrar"
        >
          <Icons.X className="w-5 h-5" />
        </button>

        <div className="p-6 sm:p-8">
          {/* Main Icon */}
          <div className="text-center">
            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-4 shadow-lg ring-4 ${variantConfig.iconBox}`}>
              {renderIcon()}
            </div>

            {/* Badge */}
            {badge && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-mono font-bold border mb-3 ${badgeVariantClass(badge.variant)}`}>
                {badge.text}
              </span>
            )}

            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white mb-2">
              {title}
            </h3>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                {subtitle}
              </p>
            )}

            {/* Message */}
            {message && (
              <div className="text-slate-300 text-sm leading-relaxed mb-6">
                {message}
              </div>
            )}
          </div>

          {/* Optional Info / Feature Box */}
          {infoBox && (
            <div className={`rounded-2xl p-4 border flex items-start gap-3 text-left mb-6 ${infoBoxVariantClass(infoBox.variant || (variant === 'danger' ? 'rose' : variant === 'warning' ? 'amber' : 'emerald'))}`}>
              <div className="mt-0.5">
                {renderInfoIcon(infoBox.icon)}
              </div>
              <div className="space-y-0.5 flex-1">
                {infoBox.title && (
                  <div className="text-xs font-bold uppercase tracking-wide">
                    {infoBox.title}
                  </div>
                )}
                <p className="text-[12px] text-slate-300/90 leading-relaxed">
                  {infoBox.text}
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 px-5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-all active:scale-95 disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 ${variantConfig.confirmBtn}`}
            >
              {isLoading ? (
                <>
                  <Icons.Loader className="w-4 h-4 animate-spin" />
                  <span>Procesando...</span>
                </>
              ) : (
                <>
                  {icon === 'trash' ? <Icons.Trash className="w-4 h-4" /> : <Icons.Send className="w-4 h-4" />}
                  <span>{confirmText}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
