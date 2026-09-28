// Image uploads accepted by the editor and the signed-upload API (shared by client and server).
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // animated GIFs are often several MB
export const IMAGE_TYPES_LABEL = "PNG, JPG, WEBP, GIF or SVG";

export const isImageType = (type: string): type is ImageType => (IMAGE_TYPES as readonly string[]).includes(type);
