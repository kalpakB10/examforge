import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent empty-state card. Use whenever a list is empty.
 */
export default function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center ${className}`}>
      {icon && (
        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400">
          {icon}
        </div>
      )}
      <p className="text-gray-700 font-semibold mb-1">{title}</p>
      {description && <p className="text-gray-400 text-sm mb-5 max-w-md mx-auto">{description}</p>}
      {action}
    </div>
  );
}
