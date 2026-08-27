import { useTranslation } from "react-i18next";
import type { Message, FormResponseData } from "@/api/types";
import { Card } from "@/components/ui/Card";

interface FormResponseMessageProps {
  message: Message;
}

export function FormResponseMessage({ message }: FormResponseMessageProps) {
  const { t } = useTranslation("chat");
  const data = message.structuredData as FormResponseData;

  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-medium text-gray-400">{t("messages.formResponse.title")}</p>
      <div className="space-y-2">
        {Object.entries(data.responses).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-sm">
            <span className="font-medium text-gray-400">{key}:</span>
            <span className="text-gray-100">{String(value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
