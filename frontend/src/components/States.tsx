/**
 * Reusable Loading / Empty / Error UI blocks so pages have consistent
 * fallbacks instead of blank screens.
 */

interface LoadingProps {
  message?: string
}

export function Loading({ message = 'Loading…' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

interface EmptyProps {
  icon?: string
  title: string
  message?: string
  action?: React.ReactNode
}

export function Empty({ icon = '📭', title, message, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      {message && <p className="text-sm text-gray-500 mb-4 max-w-sm">{message}</p>}
      {action}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 my-4">
      <div className="flex items-start gap-3">
        <div className="text-xl">⚠️</div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">{title}</h3>
          <p className="text-sm text-red-700 mt-0.5">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}
