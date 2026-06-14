import type { IMediaResolver } from './IMediaResolver.js';

/**
 * Local/demo implementation of IMediaResolver.
 *
 * Maps storage keys to the local static assets directory at
 * `/assets/uploads/{storageKey}`. Used when running locally without
 * AWS credentials or S3/CloudFront infrastructure.
 */
export class LocalMediaResolver implements IMediaResolver {
  /**
   * Resolves a storage key to a local asset URL.
   *
   * @param storageKey - The storage key from a MediaReference
   * @returns URL in the form `/assets/uploads/{storageKey}`
   */
  resolveUrl(storageKey: string): string {
    return `/assets/uploads/${storageKey}`;
  }
}
