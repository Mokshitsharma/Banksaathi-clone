import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { hmac } from '../lib/crypto';

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived URL for reading a private object. */
  signedUrl(key: string): Promise<string>;
}

/** Private S3 bucket; objects are only readable through pre-signed URLs. */
class S3StorageProvider implements StorageProvider {
  private client = new S3Client({
    region: env.AWS_REGION,
    credentials:
      env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
        : undefined,
  });

  constructor(private bucket: string) {}

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' }),
    );
  }

  signedUrl(key: string) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: env.SIGNED_URL_TTL_SECONDS,
    });
  }
}

/** Disk storage for local development, served by /files with HMAC-signed, expiring URLs. */
export class LocalStorageProvider implements StorageProvider {
  readonly root = path.resolve(env.LOCAL_UPLOAD_DIR);

  resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  async signedUrl(key: string) {
    const expires = Math.floor(Date.now() / 1000) + env.SIGNED_URL_TTL_SECONDS;
    const sig = hmac(`${key}:${expires}`);
    return `${env.API_PUBLIC_URL}/files/${encodeURI(key)}?expires=${expires}&sig=${sig}`;
  }
}

function create(): StorageProvider {
  if (env.STORAGE_PROVIDER === 's3') {
    if (!env.AWS_S3_BUCKET) throw new Error('AWS_S3_BUCKET is required when STORAGE_PROVIDER=s3');
    return new S3StorageProvider(env.AWS_S3_BUCKET);
  }
  return new LocalStorageProvider();
}

export const storage: StorageProvider = create();
