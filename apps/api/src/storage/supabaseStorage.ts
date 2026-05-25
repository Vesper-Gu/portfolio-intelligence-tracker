import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface UploadIngestImageInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface UploadIngestImageResult {
  bucket: string;
  objectKey: string;
}

export interface IngestImageUploader {
  uploadImage(userId: string, input: UploadIngestImageInput): Promise<UploadIngestImageResult>;
  createSignedUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
  downloadImage(objectKey: string): Promise<Buffer>;
  deleteImage(objectKey: string): Promise<void>;
}

export interface SupabaseStorageUploaderOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket: string;
}

export function createSupabaseStorageUploader(options: SupabaseStorageUploaderOptions): IngestImageUploader {
  const client = createClient(options.supabaseUrl, options.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return new SupabaseStorageUploader(client, options.bucket);
}

export function createSupabaseStorageUploaderFromEnv(env: NodeJS.ProcessEnv): IngestImageUploader | undefined {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_STORAGE_BUCKET;

  if (!supabaseUrl || !serviceRoleKey || !bucket) {
    return undefined;
  }

  return createSupabaseStorageUploader({ supabaseUrl, serviceRoleKey, bucket });
}

class SupabaseStorageUploader implements IngestImageUploader {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket: string
  ) {}

  async uploadImage(userId: string, input: UploadIngestImageInput): Promise<UploadIngestImageResult> {
    const objectKey = buildIngestObjectKey(userId, input.fileName);
    const { error } = await this.client.storage.from(this.bucket).upload(objectKey, input.buffer, {
      contentType: input.mimeType,
      upsert: false
    });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    return {
      bucket: this.bucket,
      objectKey
    };
  }

  async createSignedUrl(objectKey: string, expiresInSeconds: number) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(objectKey, expiresInSeconds);

    if (error) {
      throw new Error(`Supabase Storage signed URL failed: ${error.message}`);
    }

    return data.signedUrl;
  }

  async downloadImage(objectKey: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(objectKey);

    if (error) {
      throw new Error(`Supabase Storage download failed: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async deleteImage(objectKey: string) {
    const { error } = await this.client.storage.from(this.bucket).remove([objectKey]);

    if (error) {
      throw new Error(`Supabase Storage delete failed: ${error.message}`);
    }
  }
}

function buildIngestObjectKey(userId: string, fileName: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
  const safeUserId = userId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown-user";

  return `ingest/${safeUserId}/${year}/${month}/${Date.now()}-${randomUUID()}-${safeFileName}`;
}
