/** The PDF renderers take letterhead images as Buffers; JSON can't carry those directly, so the
 * browser-side PDF generation gets them base64-encoded instead (the frontend decodes them back
 * into ArrayBuffers before drawing). */
export function pdfDataWithBase64Images<T extends { signatureImage?: Buffer | null; stampImage?: Buffer | null; logoImage?: Buffer | null }>(
  data: T,
): Omit<T, "signatureImage" | "stampImage" | "logoImage"> & { signatureImage: string | null; stampImage: string | null; logoImage: string | null } {
  return {
    ...data,
    signatureImage: data.signatureImage ? data.signatureImage.toString("base64") : null,
    stampImage: data.stampImage ? data.stampImage.toString("base64") : null,
    logoImage: data.logoImage ? data.logoImage.toString("base64") : null,
  };
}
