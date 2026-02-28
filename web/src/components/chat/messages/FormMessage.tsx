import { useState, type FormEvent } from "react";
import type { Message, FormData as FormDataType } from "@/api/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConversationStore } from "@/stores/conversationStore";

interface FormMessageProps {
  message: Message;
}

export function FormMessage({ message }: FormMessageProps) {
  const data = message.structuredData as FormDataType;
  const sendMessage = useConversationStore((s) => s.sendMessage);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const field of data.fields) {
      if (field.defaultValue !== undefined) defaults[field.name] = field.defaultValue;
    }
    return defaults;
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendMessage(message.conversationId, {
        type: "form_response",
        structuredData: {
          formId: data.formId,
          responses: values,
        },
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="p-4">
        <p className="text-sm text-green-400 font-medium">Form submitted successfully</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden" borderColor="border-l-brand-500">
      <div className="border-b border-surface-border bg-surface-tertiary px-4 py-3">
        <h4 className="font-medium text-gray-100">{data.title}</h4>
        {message.content && <p className="mt-1 text-sm text-gray-400">{message.content}</p>}
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        {data.fields.map((field) => {
          if (field.type === "select") {
            return (
              <div key={field.name} className="space-y-1">
                <label className="block text-sm font-medium text-gray-300">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  required={field.required}
                  value={String(values[field.name] ?? "")}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  className="block w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "textarea") {
            return (
              <div key={field.name} className="space-y-1">
                <label className="block text-sm font-medium text-gray-300">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  required={field.required}
                  value={String(values[field.name] ?? "")}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                  placeholder={field.placeholder}
                  rows={3}
                  className="block w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
                />
              </div>
            );
          }

          if (field.type === "checkbox") {
            return (
              <label key={field.name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!values[field.name]}
                  onChange={(e) => setValues({ ...values, [field.name]: e.target.checked })}
                  className="rounded border-surface-border"
                />
                <span className="text-sm text-gray-300">{field.label}</span>
              </label>
            );
          }

          return (
            <Input
              key={field.name}
              label={`${field.label}${field.required ? " *" : ""}`}
              type={field.type === "number" ? "number" : "text"}
              required={field.required}
              placeholder={field.placeholder}
              value={String(values[field.name] ?? "")}
              onChange={(e) =>
                setValues({
                  ...values,
                  [field.name]: field.type === "number" ? Number(e.target.value) : e.target.value,
                })
              }
            />
          );
        })}
        <Button type="submit" loading={loading}>Submit</Button>
      </form>
    </Card>
  );
}
