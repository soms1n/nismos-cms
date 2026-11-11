import 'server-only';

export type ParticipantClassification = 'deleted' | 'real' | 'unknown';

export interface TelegramParticipant {
  participantId: string;
  classification: ParticipantClassification;
}

export interface TelegramChannelAccess {
  membersCount: number;
}

export interface TelegramParticipantsPage {
  participants: readonly TelegramParticipant[];
  reportedTotal: number;
}

export interface TelegramTraversalResult {
  participants: readonly TelegramParticipant[];
  membersCount: number;
}

export type TelegramGatewayErrorCode =
  | 'CHANNEL_ACCESS_DENIED'
  | 'PARTICIPANTS_HIDDEN'
  | 'INVALID_CHANNEL_DATA'
  | 'INCOMPLETE_TRAVERSAL'
  | 'INCONSISTENT_TRAVERSAL'
  | 'FLOOD_WAIT'
  | 'TELEGRAM_REQUEST_FAILED';

export class TelegramGatewayError extends Error {
  constructor(
    readonly code: TelegramGatewayErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'TelegramGatewayError';
  }
}

export interface TelegramGateway {
  getChannelAccess(): Promise<TelegramChannelAccess>;
  getParticipantsPage(
    offset: number,
    limit: number,
  ): Promise<TelegramParticipantsPage>;
  collectParticipants(): Promise<TelegramTraversalResult>;
}
