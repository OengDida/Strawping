import { Component } from 'react';

/**
 * Keeps one failing component from unmounting the whole storefront (which shows up on
 * phones as a blank page). Offers a reload instead of a dead screen.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Storefront render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div role="alert" className="grid min-h-[100svh] place-items-center bg-paper px-6 text-center text-ink">
        <div>
          <p className="text-lg font-semibold">Something went wrong loading this page.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-full bg-ink px-6 py-3 text-sm font-medium text-onsolid"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
