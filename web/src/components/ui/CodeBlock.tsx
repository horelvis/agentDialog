import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  // Only the landing renders this today — CodeExamples is its one importer —
  // and its button was the last English word on the page once everything
  // around it had been translated. The two words still come from `common`
  // rather than `landing`: they are the product's, not this section's, and the
  // chat inherits them when task 7 gets here.
  const { t } = useTranslation("common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("group relative rounded-lg bg-gray-900 text-sm", className)}>
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
        <span className="text-xs text-gray-400">{language}</span>
        <button
          onClick={copy}
          className="text-xs text-gray-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
        >
          {copied ? t("action.copied") : t("action.copy")}
        </button>
      </div>
      <pre className="overflow-x-auto p-4">
        <code className="text-gray-100">{code}</code>
      </pre>
    </div>
  );
}
