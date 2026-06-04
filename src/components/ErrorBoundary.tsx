import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { logger } from '@/lib/logger';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[ErrorBoundary] caught render error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex justify-center items-center min-h-screen p-6 bg-background">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page failed to load. The error has been logged. You can try again, or reload the
            app to recover.
          </p>
          {import.meta.env.DEV && (
            <pre className="overflow-auto p-3 text-left text-xs rounded bg-muted text-muted-foreground max-h-40">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" onClick={this.handleReset}>
              <RotateCcw className="mr-2 w-4 h-4" />
              Try again
            </Button>
            <Button onClick={this.handleReload}>Reload app</Button>
          </div>
        </div>
      </div>
    );
  }
}
