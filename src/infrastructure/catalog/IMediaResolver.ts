/**
 * Interface for resolving media storage keys to displayable URLs.
 *
 * Implementations map a MediaReference storageKey to a URL that the
 * presentation layer can render directly (e.g., in an <img> src).
 */
export interface IMediaResolver {
  /**
   * Resolves a MediaReference storageKey to a displayable URL.
   *
   * In local/demo mode: maps to /assets/uploads/{storageKey}
   * In production: generates S3 presigned URL or CloudFront URL
   *
   * @param storageKey - The storage key from a MediaReference
   * @returns A URL string suitable for rendering in the browser
   */
  resolveUrl(storageKey: string): string;
}
