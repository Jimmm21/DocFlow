import React from 'react';
import { ICONS } from '../constants';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ICONS.X size={20} />
          </button>
        </div>
        {description && (
          <div className="p-6 text-sm text-slate-600">{description}</div>
        )}
        <div className="p-5 bg-slate-50 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-5 py-2 rounded-xl font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
              danger ? 'bg-red-500 hover:bg-red-600' : 'bg-sky-blue-accent hover:bg-sky-600'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
