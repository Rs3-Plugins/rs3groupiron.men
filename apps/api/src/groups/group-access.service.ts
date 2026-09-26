import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { demoWritable } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The seeded demo group is public sample data: readable with no Authorization
 * header and read-only, because its token ships in the web bundle.
 */
const DEMO_GROUP_KEY = 'demo group';

/** Group row + member ids/names. Used wherever a handler needs the member list. */
const groupLightSelect = {
  id: true,
  name: true,
  nameKey: true,
  token: true,
  mode: true,
  appearance: true,
  memberSlots: true,
  members: { select: { id: true, name: true } },
} satisfies Prisma.GroupSelect;

export type GroupLight = Prisma.GroupGetPayload<{
  select: typeof groupLightSelect;
}>;

/**
 * groupLightSelect without the members relation. Prisma loads relations in a
 * second round trip, so handlers that never read `group.members` save a query
 * by asking for this — which matters on get-group-data and on the SSE connect.
 */
const groupAuthSelect = {
  id: true,
  name: true,
  nameKey: true,
  token: true,
  mode: true,
  appearance: true,
  memberSlots: true,
} satisfies Prisma.GroupSelect;

export type GroupAuth = Prisma.GroupGetPayload<{
  select: typeof groupAuthSelect;
}>;

export function groupNameKey(name: string) {
  return name.toLowerCase();
}

/** Constant time, so a wrong token leaks nothing about how wrong it was. */
function tokensMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Every access decision in the API.
 *
 * A group's token is its only credential — there are no user accounts — so
 * these four methods are the whole authorization model. They live apart from
 * GroupsService so that a caller needing nothing but a permission check (the
 * upload presigner, the SSE connect) does not depend on the write paths.
 *
 * An unknown group and a wrong token always produce the identical 401, so the
 * endpoints cannot be used to enumerate group names.
 */
@Injectable()
export class GroupAccessService {
  constructor(private readonly prisma: PrismaService) {}

  findGroup(groupName: string): Promise<GroupLight | null> {
    return this.prisma.group.findUnique({
      where: { nameKey: groupNameKey(groupName) },
      select: groupLightSelect,
    });
  }

  /** Read access, with the member list loaded. */
  async read(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    if (!token) {
      const group = await this.findGroup(groupName);
      if (group?.nameKey === DEMO_GROUP_KEY) return group;
      throw new UnauthorizedException('Invalid group or token');
    }
    return this.authenticate(groupName, token);
  }

  /** read()'s rules for callers that only need the group row. */
  async readWithoutMembers(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupAuth> {
    const group = await this.prisma.group.findUnique({
      where: { nameKey: groupNameKey(groupName) },
      select: groupAuthSelect,
    });
    if (!token) {
      if (group?.nameKey === DEMO_GROUP_KEY) return group;
      throw new UnauthorizedException('Invalid group or token');
    }
    if (!group || !tokensMatch(group.token, token)) {
      throw new UnauthorizedException('Invalid group or token');
    }
    return group;
  }

  /** Write access: a valid token, and never the public demo group. */
  async write(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    const group = await this.authenticate(groupName, token);
    if (group.nameKey === DEMO_GROUP_KEY && !demoWritable()) {
      throw new ForbiddenException('The demo group is read-only');
    }
    return group;
  }

  private async authenticate(
    groupName: string,
    token: string | undefined,
  ): Promise<GroupLight> {
    if (!token) throw new UnauthorizedException('Missing Authorization token');
    const group = await this.findGroup(groupName);
    if (!group || !tokensMatch(group.token, token)) {
      throw new UnauthorizedException('Invalid group or token');
    }
    return group;
  }
}
