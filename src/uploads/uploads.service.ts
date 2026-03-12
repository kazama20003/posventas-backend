import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Express } from 'express';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';

type UploadedImageFile = Express.Multer.File;

type UploadImageResult = {
  key: string;
  url: string;
  bucket: string;
  contentType: string;
  size: number;
};

@Injectable()
export class UploadsService {
  private static readonly ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  private readonly region: string;
  private readonly bucket: string;
  private readonly publicBaseUrl?: string;
  private readonly s3Client: S3Client;
  private readonly logger = new Logger(UploadsService.name);

  constructor(private readonly config: ConfigService) {
    this.region = this.config.getOrThrow<string>('AWS_REGION');
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');
    this.publicBaseUrl = this.config.get<string>('AWS_S3_PUBLIC_BASE_URL');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
  }

  private normalizeFolder(folder: string | undefined): string {
    if (!folder) {
      return 'general';
    }

    const normalized = folder
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9/_-]+/g, '-')
      .replace(/\/{2,}/g, '/')
      .replace(/^\/+|\/+$/g, '');

    return normalized.length > 0 ? normalized : 'general';
  }

  private ensureImageFile(
    file: UploadedImageFile | undefined,
  ): UploadedImageFile {
    if (!file) {
      throw new BadRequestException(
        'Debes enviar una imagen en el campo file.',
      );
    }

    if (file.size <= 0) {
      throw new BadRequestException('La imagen enviada esta vacia.');
    }

    if (!UploadsService.ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Solo se permiten imagenes JPG, PNG, WEBP o GIF.',
      );
    }

    return file;
  }

  private buildObjectKey(
    tenantId: string,
    folder: string | undefined,
    originalname: string,
  ): string {
    const safeFolder = this.normalizeFolder(folder);
    const extension = extname(originalname).toLowerCase();
    const suffix =
      extension.length > 0 && extension.length <= 10 ? extension : '';

    return `${tenantId}/${safeFolder}/${Date.now()}-${randomUUID()}${suffix}`;
  }

  private buildPublicUrl(key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/+$/g, '')}/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private assertTenantKeyOwnership(tenantId: string, key: string): string {
    const normalizedKey = key.trim().replace(/^\/+/, '');

    if (!normalizedKey) {
      throw new BadRequestException('Debes enviar un key valido.');
    }

    if (!normalizedKey.startsWith(`${tenantId}/`)) {
      throw new BadRequestException(
        'No puedes eliminar archivos de otro tenant.',
      );
    }

    return normalizedKey;
  }

  private describeS3Error(error: unknown): {
    code: string;
    message: string;
  } {
    if (error instanceof Error) {
      const code =
        typeof (error as { name?: unknown }).name === 'string'
          ? error.name
          : 'S3Error';
      const message =
        typeof (error as { message?: unknown }).message === 'string' &&
        error.message.trim().length > 0
          ? error.message.trim()
          : 'Error desconocido en S3.';

      return { code, message };
    }

    return {
      code: 'S3Error',
      message: 'Error desconocido en S3.',
    };
  }

  async uploadImage(
    tenantId: string,
    fileInput: UploadedImageFile | undefined,
    folder?: string,
  ): Promise<UploadImageResult> {
    const file = this.ensureImageFile(fileInput);
    const key = this.buildObjectKey(tenantId, folder, file.originalname);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error: unknown) {
      const details = this.describeS3Error(error);
      this.logger.error(
        `S3 upload failed (${details.code}) for bucket ${this.bucket} and key ${key}: ${details.message}`,
      );
      throw new InternalServerErrorException(
        `No se pudo subir la imagen a S3: ${details.code}. ${details.message}`,
      );
    }

    return {
      key,
      url: this.buildPublicUrl(key),
      bucket: this.bucket,
      contentType: file.mimetype,
      size: file.size,
    };
  }

  async deleteImage(
    tenantId: string,
    key: string,
  ): Promise<{ ok: true; key: string }> {
    const normalizedKey = this.assertTenantKeyOwnership(tenantId, key);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        }),
      );
    } catch (error: unknown) {
      const details = this.describeS3Error(error);
      this.logger.error(
        `S3 delete failed (${details.code}) for bucket ${this.bucket} and key ${normalizedKey}: ${details.message}`,
      );
      throw new InternalServerErrorException(
        `No se pudo eliminar la imagen de S3: ${details.code}. ${details.message}`,
      );
    }

    return { ok: true, key: normalizedKey };
  }
}
