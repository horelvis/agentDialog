import { ProfileSettings } from "@/components/profile/ProfileSettings";

export function SettingsPage() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-surface-border bg-surface-secondary px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-100">Settings</h1>
        <p className="text-sm text-gray-400">Manage your account settings.</p>
      </header>
      <div className="flex-1 p-6">
        <ProfileSettings />
      </div>
    </div>
  );
}
