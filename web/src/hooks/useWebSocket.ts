import { useEffect } from "react";
import { AgentDialogSocket } from "@/ws/socket";
import { useAuthStore } from "@/stores/authStore";
import { useConversationStore } from "@/stores/conversationStore";
import { useWsStore } from "@/stores/wsStore";
import { WS_URL } from "@/lib/constants";
import type { Message } from "@/api/types";

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const addMessage = useConversationStore((s) => s.addMessage);
  const updateMessage = useConversationStore((s) => s.updateMessage);
  const fetchConversations = useConversationStore((s) => s.fetchConversations);
  const setStatus = useWsStore((s) => s.setStatus);
  const setSocket = useWsStore((s) => s.setSocket);
  const setTyping = useWsStore((s) => s.setTyping);

  useEffect(() => {
    if (!token) return;

    try {
      const ws = new AgentDialogSocket(WS_URL, token);
      setSocket(ws);

      ws.on("connected", () => setStatus("connected"));
      ws.on("disconnected", () => setStatus("disconnected"));
      ws.on("reconnecting", () => setStatus("reconnecting"));

      ws.on("message.new", (msg) => {
        if (msg.data) addMessage(msg.data as Message);
      });

      ws.on("message.updated", (msg) => {
        if (msg.data) updateMessage(msg.data as Message);
      });

      ws.on("typing", (msg) => {
        const data = msg.data as { conversationId: string; actorType: string; actorId: string } | undefined;
        if (data?.conversationId) setTyping(data.conversationId, data.actorType, data.actorId);
      });

      ws.on("participant.joined", () => {
        fetchConversations();
      });

      ws.connect();

      return () => {
        ws.disconnect();
        setSocket(null);
      };
    } catch (e) {
      console.error("[useWebSocket] Failed to initialize:", e);
    }
  }, [token, addMessage, updateMessage, setStatus, setSocket, setTyping, fetchConversations]);
}
