/**
 * Adapter interface for media (photo/video) storage.
 *
 * Implementations:
 *  - S3MediaStorage         (infrastructure/storage) — Amazon S3 with presigned URLs
 *  - LocalMediaStorage      (infrastructure/storage) — local filesystem / LocalStack
 *
 * Requirements: 3.5, 3.8, 3.9
 */

/**
 * Result of a server-side media validation pass.
 *
 * Validation covers: blur detection, lighting check, format verification,
 * file-size enforcement, and any platform-specific content policies.
 */
export interface MediaValidationResult {
  /** Whether the media file passes all validation checks. */
  valid: boolean;
  /**
   * Machine-readable issue codes when `valid` is false.
   * e.g. ["too_blurry", "too_dark", "exceeds_size_limit", "unsupported_format"]
   */
  issues: string[];
}

/**
 * IMediaStorage — contract for any object-storage provider used to hold
 * return photos and videos.
 *
 * All uploads are performed client-side via presigned URLs so that media
 * bytes never travel through the application server (Requirement 3.5).
 */
export interface IMediaStorage {
  /**
   * Generate a presigned URL that allows the caller to HTTP PUT a media file
   * directly to the storage backend.
   *
   * @param key          - Destination storage key (e.g. `returns/{returnId}/{slot}.jpg`).
   * @param contentType  - MIME type of the file to be uploaded (e.g. `image/jpeg`).
   * @param maxSizeBytes - Maximum allowed file size in bytes; enforced by the storage policy.
   * @returns            A short-lived presigned URL valid for upload.
   */
  getPresignedUploadUrl(key: string, contentType: string, maxSizeBytes: number): Promise<string>;

  /**
   * Generate a presigned URL that allows the caller to HTTP GET a stored media file.
   *
   * @param key - Storage key of the target file.
   * @returns   A short-lived presigned URL valid for download.
   */
  getPresignedDownloadUrl(key: string): Promise<string>;

  /**
   * Run server-side validation on an already-uploaded media file.
   *
   * Checks include: blur score, exposure/lighting, file size, format,
   * and any content-moderation policies. Called after each upload to
   * determine whether the customer should be prompted to retake (Requirement 3.7).
   *
   * @param key - Storage key of the uploaded file.
   * @returns   A `MediaValidationResult` with a `valid` flag and issue codes.
   */
  validateMedia(key: string): Promise<MediaValidationResult>;

  /**
   * Permanently delete a media file from the storage backend.
   *
   * Used to clean up after a cancelled return or when a media slot is retaken.
   * Implementations MUST treat a missing key as a no-op (idempotent delete).
   *
   * @param key - Storage key of the file to delete.
   */
  deleteMedia(key: string): Promise<void>;
}
