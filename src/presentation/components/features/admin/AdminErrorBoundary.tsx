import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class AdminErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[AdminErrorBoundary] Erro capturado:', error);
    console.error('[AdminErrorBoundary] Stack trace:', errorInfo.componentStack);
    this.setState({ error, errorInfo });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full">
              <h2 className="text-xl font-semibold text-red-600 mb-4">
                Erro ao carregar a página de admin
              </h2>
              <p className="text-gray-600 mb-4">
                Ocorreu um erro inesperado. Detalhes técnicos:
              </p>
              <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-48 text-red-700">
                {this.state.error?.message}
                {'\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Recarregar página
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
