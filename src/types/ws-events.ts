// Client -> Server events
export interface WsSubscribe {
  type: "subscribe";
  conversationId: string;
}

export interface WsUnsubscribe {
  type: "unsubscribe";
  conversationId: string;
}

export interface WsTyping {
  type: "typing";
  conversationId: string;
}

export interface WsRead {
  type: "read";
  conversationId: string;
  messageId: string;
}

export interface WsPing {
  type: "ping";
}

export type WsClientEvent = WsSubscribe | WsUnsubscribe | WsTyping | WsRead | WsPing;

// Server -> Client events
export interface WsMessageNew {
  type: "message.new";
  data: Record<string, unknown>;
}

export interface WsMessageUpdated {
  type: "message.updated";
  data: Record<string, unknown>;
}

export interface WsMessageDeleted {
  type: "message.deleted";
  data: { messageId: string; conversationId: string };
}

export interface WsParticipantJoined {
  type: "participant.joined";
  data: Record<string, unknown>;
}

export interface WsParticipantLeft {
  type: "participant.left";
  data: { conversationId: string; actorType: string; actorId: string };
}

export interface WsTypingEvent {
  type: "typing";
  data: { conversationId: string; actorType: string; actorId: string };
}

export interface WsReadEvent {
  type: "read";
  data: { conversationId: string; actorType: string; actorId: string; messageId: string };
}

export interface WsInvitationUpdated {
  type: "invitation.updated";
  data: Record<string, unknown>;
}

export interface WsConversationUpdated {
  type: "conversation.updated";
  data: Record<string, unknown>;
}

export interface WsPong {
  type: "pong";
}

export interface WsError {
  type: "error";
  data: { code: string; message: string };
}

export type WsServerEvent =
  | WsMessageNew
  | WsMessageUpdated
  | WsMessageDeleted
  | WsParticipantJoined
  | WsParticipantLeft
  | WsTypingEvent
  | WsReadEvent
  | WsInvitationUpdated
  | WsConversationUpdated
  | WsPong
  | WsError;
