import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

/** Screenshots are PNG only — signed into the URL, so nothing else uploads. */
export const UPLOAD_CONTENT_TYPE = 'image/png';
export const UPLOAD_EXTENSION = '.png';

/** Default cap when UPLOAD_MAX_BYTES is unset. */
export const UPLOAD_MAX_BYTES_DEFAULT = 5 * 1024 * 1024;

/** Presigned URLs are short-lived; the client uploads immediately. */
export const UPLOAD_URL_TTL_SECONDS = 300;

export type AchievementFolder =
  'levelups' | 'drops' | 'quests' | 'diaries' | 'other';

/** Achievement kind -> CDN folder, matching cdn.../achievements/<id>/<folder>/. */
const FOLDER_BY_KIND: Record<string, AchievementFolder> = {
  level: 'levelups',
  drop: 'drops',
  quest: 'quests',
  diary: 'diaries',
  other: 'other',
};

export function folderForKind(kind: string): AchievementFolder {
  return FOLDER_BY_KIND[kind] ?? 'other';
}

export function uploadMaxBytes(): number {
  const raw = Number(process.env.UPLOAD_MAX_BYTES);
  if (!Number.isFinite(raw) || raw <= 0) return UPLOAD_MAX_BYTES_DEFAULT;
  return Math.trunc(raw);
}

/** Trailing slashes break URL joins; strip them once here. */
function trimSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

/** Null when the deployment has not configured R2 — uploads stay optional. */
export function readR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.CDN_BASE_URL?.trim();
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: trimSlashes(publicBaseUrl),
  };
}

export type PresignedUpload = {
  upload_url: string;
  public_url: string;
  key: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_in: number;
  max_bytes: number;
};

@Injectable()
export class R2Service {
  private client: S3Client | null = null;
  private clientFor: string | null = null;

  /** Whether this deployment can issue uploads at all. */
  isConfigured(): boolean {
    return readR2Config() !== null;
  }

  private config(): R2Config {
    const config = readR2Config();
    if (!config) {
      throw new ServiceUnavailableException(
        'Image uploads are not configured on this server',
      );
    }
    return config;
  }

  /** Cached per credential set so config changes are picked up on restart. */
  private s3(config: R2Config): S3Client {
    const fingerprint = `${config.accountId}:${config.accessKeyId}`;
    if (this.client && this.clientFor === fingerprint) return this.client;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // The SDK otherwise precomputes a CRC32 of the (empty) body at signing
      // time and pins it in the URL, so the real upload fails the checksum.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    this.clientFor = fingerprint;
    return this.client;
  }

  /**
   * Presign a one-shot PNG PUT. Content type and exact length are part of the
   * signature, so the client cannot upload a different type or a bigger file.
   * The key is generated here — a caller can never choose where it writes.
   */
  async presignAchievementImage(opts: {
    groupId: string;
    kind: string;
    contentLength: number;
  }): Promise<PresignedUpload> {
    const config = this.config();
    const key = [
      'achievements',
      opts.groupId,
      folderForKind(opts.kind),
      `${randomUUID()}${UPLOAD_EXTENSION}`,
    ].join('/');

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: UPLOAD_CONTENT_TYPE,
      ContentLength: opts.contentLength,
    });

    const uploadUrl = await getSignedUrl(this.s3(config), command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
      // Force both into the signature; without this the SDK may omit them and
      // the size/type caps would be advisory only.
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return {
      upload_url: uploadUrl,
      public_url: `${config.publicBaseUrl}/${key}`,
      key,
      method: 'PUT',
      headers: {
        'Content-Type': UPLOAD_CONTENT_TYPE,
        'Content-Length': String(opts.contentLength),
      },
      expires_in: UPLOAD_URL_TTL_SECONDS,
      max_bytes: uploadMaxBytes(),
    };
  }
}
