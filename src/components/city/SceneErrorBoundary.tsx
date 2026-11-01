"use client";

import { Component, type ReactNode } from "react";

/** Catches render/runtime errors inside the 3D scene so the page never goes blank. */
export class SceneErrorBoundary extends Component<{ fallback: (reset: () => void) => ReactNode; children: ReactNode; onError?: (e: Error) => void }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error);
    console.error("[SWS] 3D scene error", error);
  }

  reset = () => this.setState({ error: null });

  override render() {
    return this.state.error ? this.props.fallback(this.reset) : this.props.children;
  }
}
