import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../config/r2";
import { env } from "../config/env";
import { AppError } from "./errors";

export async function uploadToR2(
  file: File,
  folder: string,
  _userId?: string,
  _gameId?: string,
): Promise<{ url: string; key: string }> {
  const ext = file.name.split(".").pop();
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: new Uint8Array(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    );
  } catch (e) {
    throw new AppError("UPLOAD_FAILED", "File upload failed", 500, e);
  }

  return { url: `${env.R2_PUBLIC_URL}/${key}`, key };
}

export async function uploadToR2Structured(
  file: File,
  userId: string,
  gameId: string,
  baseName: string,
): Promise<{ url: string; key: string }> {
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = file.name.split(".").pop();
  const screenshotId = crypto.randomUUID();
  const key = `${userId}/${gameId}/${screenshotId}-${sanitized}.${ext}`;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: new Uint8Array(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    );
  } catch (e) {
    throw new AppError("UPLOAD_FAILED", "File upload failed", 500, e);
  }

  return { url: `${env.R2_PUBLIC_URL}/${key}`, key };
}

export async function deleteFromR2(key: string): Promise<void> {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  } catch (e) {
    throw new AppError("DELETE_FAILED", "File deletion failed", 500, e);
  }
}

export async function updateInR2(
  oldKey: string,
  file: File,
  folder: string,
): Promise<{ url: string; key: string }> {
  await deleteFromR2(oldKey);
  return uploadToR2(file, folder);
}
