import 'server-only';

import { tl, type ChatMember, type TelegramClient } from '@mtcute/node';

import {
  TelegramGatewayError,
  type TelegramChannelAccess,
  type TelegramGateway,
  type TelegramParticipant,
  type TelegramParticipantsPage,
  type TelegramTraversalResult,
} from './gateway';

const PAGE_SIZE = 200;

type TelegramReader = Pick<TelegramClient, 'getFullChat' | 'getChatMembers'>;

function wrapTelegramError(error: unknown): never {
  if (tl.RpcError.is(error) && error.is('FLOOD_WAIT_%d')) {
    throw new TelegramGatewayError(
      'FLOOD_WAIT',
      'Telegram rate limit prevented a complete traversal',
      error.seconds,
    );
  }

  if (error instanceof TelegramGatewayError) {
    throw error;
  }

  throw new TelegramGatewayError(
    'TELEGRAM_REQUEST_FAILED',
    'Telegram request failed',
  );
}

function participantId(member: ChatMember): string | undefined {
  const raw = member.raw;
  if (
    raw._ === 'channelParticipantBanned' ||
    raw._ === 'channelParticipantLeft'
  ) {
    return raw.peer._ === 'peerUser' ? String(raw.peer.userId) : undefined;
  }

  return 'userId' in raw ? String(raw.userId) : undefined;
}

function classifyParticipant(member: ChatMember): TelegramParticipant {
  const id = participantId(member);
  let classification: TelegramParticipant['classification'] = 'unknown';

  if (
    member.raw._ === 'channelParticipant' ||
    member.raw._ === 'channelParticipantSelf' ||
    member.raw._ === 'channelParticipantCreator' ||
    member.raw._ === 'channelParticipantAdmin' ||
    member.raw._ === 'chatParticipant' ||
    member.raw._ === 'chatParticipantCreator' ||
    member.raw._ === 'chatParticipantAdmin'
  ) {
    try {
      const user = member.user;
      if (!user.isMin) {
        classification = user.isDeleted ? 'deleted' : 'real';
      }
    } catch {
      classification = 'unknown';
    }
  }

  return {
    participantId: id ?? 'unknown',
    classification,
  };
}

export class MtcuteTelegramGateway implements TelegramGateway {
  constructor(
    private readonly client: TelegramReader,
    private readonly channelRef: string,
  ) {}

  async getChannelAccess(): Promise<TelegramChannelAccess> {
    try {
      const channel = await this.client.getFullChat(this.channelRef);
      if (channel.full._ !== 'channelFull') {
        throw new TelegramGatewayError(
          'INVALID_CHANNEL_DATA',
          'The configured peer is not a channel',
        );
      }
      if (!channel.canViewParticipants) {
        throw new TelegramGatewayError(
          'CHANNEL_ACCESS_DENIED',
          'The Telegram account cannot view channel participants',
        );
      }
      if (channel.hasHiddenParticipants) {
        throw new TelegramGatewayError(
          'PARTICIPANTS_HIDDEN',
          'Channel participants are hidden',
        );
      }
      if (
        !Number.isSafeInteger(channel.membersCount) ||
        channel.membersCount < 0
      ) {
        throw new TelegramGatewayError(
          'INVALID_CHANNEL_DATA',
          'Telegram returned an invalid members count',
        );
      }

      return { membersCount: channel.membersCount };
    } catch (error) {
      return wrapTelegramError(error);
    }
  }

  async getParticipantsPage(
    offset: number,
    limit: number,
  ): Promise<TelegramParticipantsPage> {
    try {
      const members = await this.client.getChatMembers(this.channelRef, {
        type: 'all',
        query: '',
        offset,
        limit,
      });
      return {
        participants: members.map(classifyParticipant),
        reportedTotal: members.total,
      };
    } catch (error) {
      return wrapTelegramError(error);
    }
  }

  async collectParticipants(): Promise<TelegramTraversalResult> {
    const access = await this.getChannelAccess();
    const participants = new Map<string, TelegramParticipant>();
    const maximumPages = Math.max(
      1,
      Math.ceil(access.membersCount / PAGE_SIZE) + 1,
    );
    let offset = 0;
    let exhausted = false;

    for (let pageNumber = 0; pageNumber < maximumPages; pageNumber += 1) {
      const page = await this.getParticipantsPage(offset, PAGE_SIZE);
      if (page.reportedTotal !== access.membersCount) {
        throw new TelegramGatewayError(
          'INCONSISTENT_TRAVERSAL',
          'Telegram participant counts changed during traversal',
        );
      }
      if (page.participants.length > PAGE_SIZE) {
        throw new TelegramGatewayError(
          'INVALID_CHANNEL_DATA',
          'Telegram returned an oversized participants page',
        );
      }
      if (page.participants.length === 0) {
        exhausted = true;
        break;
      }

      for (const participant of page.participants) {
        if (participant.participantId === 'unknown') {
          throw new TelegramGatewayError(
            'INVALID_CHANNEL_DATA',
            'Telegram returned a participant without a supported identifier',
          );
        }
        const previous = participants.get(participant.participantId);
        if (
          previous &&
          previous.classification !== participant.classification
        ) {
          throw new TelegramGatewayError(
            'INCONSISTENT_TRAVERSAL',
            'Telegram returned contradictory participant data',
          );
        }
        participants.set(participant.participantId, participant);
      }

      offset += page.participants.length;
    }

    if (!exhausted || participants.size !== access.membersCount) {
      throw new TelegramGatewayError(
        'INCOMPLETE_TRAVERSAL',
        'Telegram did not provide the complete channel participants list',
      );
    }

    return {
      participants: [...participants.values()],
      membersCount: access.membersCount,
    };
  }
}
