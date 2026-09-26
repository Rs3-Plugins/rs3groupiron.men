import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { GroupsService } from '../groups/groups.service';
import { AchievementUploadBody } from './upload.types';
import { R2Service, uploadMaxBytes } from './r2.service';

/**
 * Presigned uploads for achievement screenshots.
 *
 * The bytes go straight from the client to Cloudflare R2 — they never pass
 * through this API. The response also carries the final public URL, which is
 * what the client sends back as `image_url` when it posts the achievement.
 */
@Controller('group/:groupName/achievements')
export class UploadsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly r2: R2Service,
  ) {}

  @Post('upload-url')
  @HttpCode(200)
  async createUploadUrl(
    @Param('groupName') groupName: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AchievementUploadBody,
  ) {
    // Same write guard as posting an achievement: a valid token, and never
    // the read-only demo group.
    const group = await this.groups.authenticateWrite(groupName, authorization);

    const max = uploadMaxBytes();
    if (body.content_length > max) {
      throw new BadRequestException(
        `Image is too large (${body.content_length} bytes); the limit is ${max} bytes`,
      );
    }

    return this.r2.presignAchievementImage({
      groupId: group.id,
      kind: body.kind,
      contentLength: body.content_length,
    });
  }
}
