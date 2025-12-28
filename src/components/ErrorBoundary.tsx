import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900 text-white h-screen overflow-auto">
          <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
          <pre className="text-sm font-mono whitespace-pre-wrap bg-black/50 p-2 rounded">
            {this.state.error?.toString()}
          </pre>
          <pre className="text-xs font-mono mt-2 opacity-75">
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            className="mt-4 px-4 py-2 bg-white text-black rounded"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
