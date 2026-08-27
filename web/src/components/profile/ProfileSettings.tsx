import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import * as profileApi from "@/api/profile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";

export function ProfileSettings() {
  const { t } = useTranslation("chat");
  const human = useAuthStore((s) => s.human);
  const [displayName, setDisplayName] = useState(human?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await profileApi.updateProfile({ displayName });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile section */}
      <div className="rounded-xl border border-surface-border bg-surface-secondary p-6">
        <div className="flex items-center gap-4">
          <Avatar name={human?.displayName ?? human?.email ?? t("shared.user")} size="lg" />
          <div>
            <h3 className="font-semibold text-gray-100">
              {human?.displayName ?? human?.email ?? t("shared.user")}
            </h3>
            <p className="text-sm text-gray-500">{human?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label={t("settings.emailLabel")}
            value={human?.email ?? ""}
            disabled
          />
          <Input
            id="displayName"
            label={t("settings.displayNameLabel")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("settings.displayNamePlaceholder")}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>{t("settings.saveChanges")}</Button>
            {saved && <span className="text-sm text-green-400">{t("settings.saved")}</span>}
          </div>
        </form>
      </div>

      {/* Session section */}
      <div className="rounded-xl border border-surface-border bg-surface-secondary p-6">
        <h3 className="font-semibold text-gray-100">{t("settings.sessionTitle")}</h3>
        <p className="mt-1 text-sm text-gray-500">{t("settings.sessionBody")}</p>
        <div className="mt-4">
          <Button
            variant="danger"
            size="sm"
            onClick={() => useAuthStore.getState().logout()}
          >
            {t("settings.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}
