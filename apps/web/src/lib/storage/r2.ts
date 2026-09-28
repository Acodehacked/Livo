import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Env } from "@/lib/env";

export async function createAssetUploadUrl(input: { presentationId: string; fileName: string; contentType: string }) {
  const env = r2Env(); const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const key = `presentations/${input.presentationId}/assets/${crypto.randomUUID()}-${safeName}`;
  const client = new S3Client({ region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: input.contentType }), { expiresIn: 300 });
  return { key, uploadUrl, publicUrl: `${env.R2_PUBLIC_BASE_URL}/${key}` };
}
