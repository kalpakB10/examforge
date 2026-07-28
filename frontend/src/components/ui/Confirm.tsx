import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;   // red confirm button for destructive actions
}

interface Pending {
  opts: ConfirmOptions;
  resolve: (v: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const normalised: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise((resolve) => {
      setPending({ opts: normalised, resolve });
    });
  }, []);

  const handle = (result: boolean) => {
    if (!pending) return;
    pending.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6" role="dialog" aria-modal="true">
            {pending.opts.title && (
              <h3 className="text-base font-bold text-gray-900 mb-2">{pending.opts.title}</h3>
            )}
            <p className="text-sm text-gray-600 leading-relaxed">{pending.opts.message}</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => handle(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
                {pending.opts.cancelLabel ?? 'Cancel'}
              </button>
              <button onClick={() => handle(true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors shadow-sm ${
                  pending.opts.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}>
                {pending.opts.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}
