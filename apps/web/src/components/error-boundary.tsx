import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 轻量错误边界:拦截渲染异常并提供重试,避免整页白屏。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // 异常信息直接呈现在边界卡片中,不额外污染控制台。
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-line bg-white p-6">
            <h2 className="text-base font-medium text-ink-strong">页面渲染出现异常</h2>
            <p className="mt-2 break-words text-sm text-ink-mid">{this.state.error.message || "未知错误"}</p>
            <Button type="button" className="mt-4" onClick={this.handleRetry}>
              重试
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
