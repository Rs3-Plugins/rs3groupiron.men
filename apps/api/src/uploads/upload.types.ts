import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

/** Request an upload slot for an achievement screenshot. */
export class AchievementUploadBody {
  /** Decides the CDN folder (levelups, drops, quests, diaries, other). */
  @IsIn(['level', 'drop', 'quest', 'diary', 'other'])
  kind!: 'level' | 'drop' | 'quest' | 'diary' | 'other';

  /**
   * Exact byte length of the PNG. Signed into the URL, so the upload must
   * match it; the server also checks it against UPLOAD_MAX_BYTES.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  content_length!: number;
}
