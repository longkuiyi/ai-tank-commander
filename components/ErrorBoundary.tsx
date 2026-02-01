import React from 'react';
import { t } from '../utils/i18n';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component
 * Catches JavaScript errors in child component tree to prevent the entire app from crashing
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center p-6">
          <div className="bg-slate-900 border border-red-500/30 p-8 rounded-2xl max-w-2xl w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">{t('error.title')}</h1>
                <p className="text-sm text-white/60">{t('error.subtitle')}</p>
              </div>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="bg-black/40 p-4 rounded-xl mb-4 overflow-auto max-h-64">
                <p className="text-red-400 font-mono text-sm mb-2">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                {t('error.reload')}
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-xl transition-all"
              >
                {t('error.home')}
              </button>
            </div>

            <p className="text-white/40 text-xs mt-4 text-center">
              {t('error.note')}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
