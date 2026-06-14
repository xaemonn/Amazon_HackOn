import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { LocalFilesystemMediaStorage } from './LocalFilesystemMediaStorage.js';

const TEST_BASE_PATH = './test-uploads-media';

describe('LocalFilesystemMediaStorage', () => {
  let storage: LocalFilesystemMediaStorage;

  beforeEach(() => {
    storage = new LocalFilesystemMediaStorage(TEST_BASE_PATH);
  });

  afterEach(async () => {
    await storage.clear();
  });

  describe('getPresignedUploadUrl', () => {
    it('returns a file:// URL with the resolved path', async () => {
      const url = await storage.getPresignedUploadUrl('returns/123/front.jpg', 'image/jpeg', 10_485_760);
      const expected = `file://${path.resolve(TEST_BASE_PATH, 'returns/123/front.jpg')}`;
      expect(url).toBe(expected);
    });

    it('creates the directory structure', async () => {
      await storage.getPresignedUploadUrl('nested/dir/photo.png', 'image/png', 10_485_760);
      const dir = path.resolve(TEST_BASE_PATH, 'nested/dir');
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('returns a file:// URL with the resolved path', async () => {
      const url = await storage.getPresignedDownloadUrl('returns/456/back.png');
      const expected = `file://${path.resolve(TEST_BASE_PATH, 'returns/456/back.png')}`;
      expect(url).toBe(expected);
    });
  });

  describe('validateMedia', () => {
    it('returns file_not_found when file does not exist', async () => {
      const result = await storage.validateMedia('nonexistent.jpg');
      expect(result).toEqual({ valid: false, issues: ['file_not_found'] });
    });

    it('returns valid for a JPEG file within size limit', async () => {
      const key = 'test-photo.jpg';
      await storage.getPresignedUploadUrl(key, 'image/jpeg', 10_485_760);
      // Write a small file
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(1024)); // 1KB

      const result = await storage.validateMedia(key);
      expect(result).toEqual({ valid: true, issues: [] });
    });

    it('returns valid for a PNG file within size limit', async () => {
      const key = 'test-photo.png';
      await storage.getPresignedUploadUrl(key, 'image/png', 10_485_760);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(512));

      const result = await storage.validateMedia(key);
      expect(result).toEqual({ valid: true, issues: [] });
    });

    it('returns valid for an MP4 video within size limit', async () => {
      const key = 'test-video.mp4';
      await storage.getPresignedUploadUrl(key, 'video/mp4', 52_428_800);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(2048));

      const result = await storage.validateMedia(key);
      expect(result).toEqual({ valid: true, issues: [] });
    });

    it('returns valid for a MOV video within size limit', async () => {
      const key = 'test-video.mov';
      await storage.getPresignedUploadUrl(key, 'video/quicktime', 52_428_800);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(2048));

      const result = await storage.validateMedia(key);
      expect(result).toEqual({ valid: true, issues: [] });
    });

    it('returns exceeds_size_limit when file is too large', async () => {
      const key = 'big-photo.jpg';
      const maxSize = 1024; // 1KB limit for testing
      await storage.getPresignedUploadUrl(key, 'image/jpeg', maxSize);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(2048)); // 2KB — over limit

      const result = await storage.validateMedia(key);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('exceeds_size_limit');
    });

    it('returns unsupported_format for unknown extensions', async () => {
      const key = 'file.bmp';
      await storage.getPresignedUploadUrl(key, 'image/bmp', 10_485_760);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(100));

      const result = await storage.validateMedia(key);
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('unsupported_format');
    });

    it('uses default size limits when no upload metadata exists', async () => {
      const key = 'orphan-photo.jpg';
      // Write file directly without calling getPresignedUploadUrl
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.mkdir(TEST_BASE_PATH, { recursive: true });
      await fs.writeFile(filePath, Buffer.alloc(512));

      const result = await storage.validateMedia(key);
      expect(result).toEqual({ valid: true, issues: [] });
    });
  });

  describe('deleteMedia', () => {
    it('deletes an existing file', async () => {
      const key = 'to-delete.jpg';
      await storage.getPresignedUploadUrl(key, 'image/jpeg', 10_485_760);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(100));

      await storage.deleteMedia(key);

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('is idempotent — no error when file does not exist', async () => {
      await expect(storage.deleteMedia('nonexistent.jpg')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes all files in the uploads directory', async () => {
      const key = 'clearable.jpg';
      await storage.getPresignedUploadUrl(key, 'image/jpeg', 10_485_760);
      const filePath = path.resolve(TEST_BASE_PATH, key);
      await fs.writeFile(filePath, Buffer.alloc(100));

      await storage.clear();

      await expect(fs.access(TEST_BASE_PATH)).rejects.toThrow();
    });
  });
});
