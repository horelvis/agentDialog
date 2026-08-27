import { Component, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// A class component can't use useTranslation, so `t` arrives as a prop from
// the withTranslation HOC below. Both catalogue keys already exist in
// `common` — this is the one surface where "something went wrong" and "try
// again" show up outside a specific error state.
class ErrorBoundaryBase extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        this.props.fallback ?? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
            <p className="text-red-400 font-medium">{t("error.unexpected")}</p>
            <p className="text-sm text-gray-500">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
            >
              {t("action.retry")}
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation("common")(ErrorBoundaryBase);
