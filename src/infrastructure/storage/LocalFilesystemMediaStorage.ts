/**
 * LocalFilesystemMediaStorage — dev/demo implementation of IMediaStorage.
 *
 * Stores media files on the local filesystem under a configurable base path.
 * "Presigned URLs" are simply local file:// paths — intentional for local dev.
 * The real S3 adapter generates actual presigned URLs.
 *
 * Requirements: 3.8, 16.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { IMediaStorage, MediaValidationResult } from '../../domain/returns/IMediaStorage.js';

/** Metadata stored when a presigned upload URL is generated. */
interface UploadMetadata {
  contentType: string;
  maxSizeBytes: number;
}

/** Accepted photo MIME types with max size (10 MB). */
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const PHOTO_MAX_BYTES = 10_485_760; // 10 MB

/** Accepted video MIME types with max size (50 MB). */
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime']);
const VIDEO_MAX_BYTES = 52_428_800; // 50 MB

/** File extension → MIME type mapping for validation. */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

const ACCEPTED_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_MIME));

export class LocalFilesystemMediaStorage implements IMediaStorage {
  private readonly basePath: string;
  private readonly uploadMetadata = new Map<string, UploadMetadata>();

  constructor(basePath: string = './uploads') {
    this.basePath = basePath;
  }

  /**
   * Generate a local file path as the "presigned upload URL."
   * Creates the target directory if it doesn't exist.
   * Stores metadata so validateMedia can check limits later.
   */
  async getPresignedUploadUrl(key: string, contentType: string, maxSizeBytes: number): Promise<string> {
    const filePath = path.resolve(this.basePath, key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Store metadata for later validation
    this.uploadMetadata.set(key, { contentType, maxSizeBytes });

    return `file://${filePath}`;
  }

  /**
   * Generate a local file path as the "presigned download URL."
   */
  async getPresignedDownloadUrl(key: string): Promise<string> {
    const filePath = path.resolve(this.basePath, key);
    return `file://${filePath}`;
  }

  /**
   * Validate an uploaded media file.
   * Checks: existence, file size, and content type / file extension.
   */
  async validateMedia(key: string): Promise<MediaValidationResult> {
    const issues: string[] = [];
    const filePath = path.resolve(this.basePath, key);

    // Check file existence
    try {
      await fs.access(filePath);
    } catch {
      return { valid: false, issues: ['file_not_found'] };
    }

    const stat = await fs.stat(filePath);
    const ext = path.extname(key).toLowerCase();

    // Check file extension is accepted
    if (!ACCEPTED_EXTENSIONS.has(ext)) {
      issues.push('unsupported_format');
    }

    // Determine size limit based on stored metadata or file extension
    const metadata = this.uploadMetadata.get(key);
    let maxSize: number;

    if (metadata) {
      maxSize = metadata.maxSizeBytes;
    } else if (PHOTO_MIME_TYPES.has(EXTENSION_TO_MIME[ext] ?? '')) {
      maxSize = PHOTO_MAX_BYTES;
    } else if (VIDEO_MIME_TYPES.has(EXTENSION_TO_MIME[ext] ?? '')) {
      maxSize = VIDEO_MAX_BYTES;
    } else {
      // Unknown type — use photo limit as default
      maxSize = PHOTO_MAX_BYTES;
    }

    // Check file size
    if (stat.size > maxSize) {
      issues.push('exceeds_size_limit');
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Delete a media file. No-op if file doesn't exist (idempotent).
   */
  async deleteMedia(key: string): Promise<void> {
    const filePath = path.resolve(this.basePath, key);
    try {
      await fs.unlink(filePath);
    } catch (err: unknown) {
      // No-op if file doesn't exist
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
    // Clean up metadata
    this.uploadMetadata.delete(key);
  }

  /**
   * Remove all files in the uploads directory. Useful for test teardown.
   */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.basePath, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
    this.uploadMetadata.clear();
  }
}
