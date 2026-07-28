import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Root-level error boundary. Catches render-time errors anywhere in the tree
 * and shows a graceful fallback instead of a blank white screen. Once Sentry
 * is set up (window.__SENTRY__ present), errors are reported automatically.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Best-effort Sentry report if the SDK has been initialized.
    const sentry = (window as any).Sentry
    if (sentry?.captureException) {
      sentry.captureException(error, { extra: { componentStack: info.componentStack } })
    }
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-600 mb-6">
            The page hit an unexpected error. Try reloading — if it keeps happening, please contact support.
          </p>
          <details className="text-left text-xs text-gray-500 mb-6 bg-gray-50 rounded-lg p-3 overflow-auto max-h-40">
            <summary className="cursor-pointer font-medium mb-2">Technical details</summary>
            <div className="font-mono whitespace-pre-wrap break-words">
              {this.state.error.name}: {this.state.error.message}
            </div>
          </details>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700"
            >
              Reload page
            </button>
            <button
              onClick={this.reset}
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
