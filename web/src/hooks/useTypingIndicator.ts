import { useCallback, useRef } from "react";

export function useTypingIndicator(wsRef: React.RefObject<{ current: { send: (msg: unknown) => void } | null } | null>) {
  const lastSent = useRef(0);

  return useCallback(
    (conversationId: string) => {
      const now = Date.now();
      if (now - lastSent.current < 2000) return;
      lastSent.current = now;
      wsRef.current?.current?.send({ type: "typing", conversationId });
    },
    [wsRef]
  );
}
