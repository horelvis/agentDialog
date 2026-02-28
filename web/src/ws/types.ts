export type WsEventType =
  | "subscribe"
  | "unsubscribe"
  | "subscribed"
  | "message.new"
  | "message.updated"
  | "message.deleted"
  | "typing"
  | "read"
  | "participant.joined"
  | "participant.left"
  | "invitation.updated"
  | "conversation.updated"
  | "ping"
  | "pong"
  | "connected"
  | "disconnected"
  | "reconnecting";

export interface WsMessage {
  type: WsEventType;
  conversationId?: string;
  messageId?: string;
  data?: unknown;
}
