import { useState, type FormEvent } from "react";
import { useAuthStore } from "@/stores/authStore";
import * as profileApi from "@/api/profile";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";

export function ProfileSettings() {
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
          <Avatar name={human?.displayName ?? human?.email ?? "User"} size="lg" />
          <div>
            <h3 className="font-semibold text-gray-100">
              {human?.displayName ?? human?.email ?? "User"}
            </h3>
            <p className="text-sm text-gray-500">{human?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email"
            value={human?.email ?? ""}
            disabled
          />
          <Input
            id="displayName"
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How others see you"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" loading={saving}>Save changes</Button>
            {saved && <span className="text-sm text-green-400">Saved!</span>}
          </div>
        </form>
      </div>

      {/* Session section */}
      <div className="rounded-xl border border-surface-border bg-surface-secondary p-6">
        <h3 className="font-semibold text-gray-100">Session</h3>
        <p className="mt-1 text-sm text-gray-500">
          Manage your current session.
        </p>
        <div className="mt-4">
          <Button
            variant="danger"
            size="sm"
            onClick={() => useAuthStore.getState().logout()}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
