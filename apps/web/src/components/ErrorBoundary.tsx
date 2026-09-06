import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from './ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI Exception caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-dvh flex items-center justify-center p-6 bg-bone text-ink">
          <div className="max-w-md w-full bg-paper border border-ink/20 rounded-lg p-6 shadow-soft-xl space-y-4 text-center">
            <div className="size-12 rounded-full bg-rose/10 text-rose mx-auto flex items-center justify-center font-bold font-mono text-lg">
              !
            </div>
            <h1 className="font-display text-xl font-bold text-ink">Something went wrong</h1>
            <p className="text-xs text-ink-3 leading-relaxed">
              An unexpected error occurred while rendering this view. Please reload the console.
            </p>
            {this.state.error?.message && (
              <div className="p-2.5 bg-mist/60 border border-ink/10 rounded font-mono text-[11px] text-ink-4 text-left overflow-x-auto">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2">
              <Button variant="primary" onClick={this.handleReset} className="w-full">
                Reload Application
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
