export interface HumanPublic {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface HumanSelf extends HumanPublic {
  email: string;
  preferences: Record<string, unknown>;
  createdAt: string;
}
