"use node";

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { classSessionVideoFields } from "./model/classSessionVideoFields";
import {
  SESSION_VIDEO_PART_BYTES,
  sessionVideoObjectKey,
  sessionVideoPartSize,
} from "../lib/class-session-video";

const PART_URL_TTL_SECONDS = 15 * 60;
const PLAYBACK_URL_TTL_SECONDS = 2 * 60 * 60;

function storage(bucket?: string) {
  const privateBucket = process.env.PRERECORDED_S3_BUCKET;
  const {
    PRERECORDED_S3_ACCESS_KEY: accessKeyId,
    PRERECORDED_S3_SECRET_KEY: secretAccessKey,
    PRERECORDED_S3_ENDPOINT: endpoint,
    PRERECORDED_S3_REGION: region,
  } = process.env;
  // Existing LiveKit recordings use the public bucket. New scheduled videos must not.
  if (
    !privateBucket ||
    privateBucket === process.env.S3_BUCKET ||
    bucket === process.env.S3_BUCKET ||
    !accessKeyId ||
    !secretAccessKey ||
    !endpoint ||
    !region
  )
    throw new ConvexError("SESSION_VIDEO_STORAGE_NOT_CONFIGURED");
  return {
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }),
    Bucket: bucket ?? privateBucket,
  };
}

async function uploadContext(
  ctx: ActionCtx,
  id: Id<"classSessionVideos">,
): Promise<Doc<"classSessionVideos">> {
  const video = await ctx.runQuery(internal.classSessionVideos.uploadContext, {
    id,
  });
  if (video.state === "uploading" && (video.expiresAt ?? 0) <= Date.now())
    throw new ConvexError("SESSION_VIDEO_UPLOAD_EXPIRED");
  return video;
}

export const begin = action({
  args: {
    scheduleId: v.id("classSchedule"),
    ...classSessionVideoFields.pick(
      "name",
      "contentType",
      "size",
      "durationMs",
      "lessonIds",
    ).fields,
  },
  returns: v.object({ id: v.id("classSessionVideos"), partSize: v.number() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ id: Id<"classSessionVideos">; partSize: number }> => {
    const { client, Bucket } = storage();
    const id = await ctx.runMutation(internal.classSessionVideos.reserve, {
      ...args,
      bucket: Bucket,
    });
    let uploadId: string | undefined;
    try {
      const result = await client.send(
        new CreateMultipartUploadCommand({
          Bucket,
          Key: sessionVideoObjectKey(id),
          ContentType: args.contentType,
        }),
      );
      if (!result.UploadId)
        throw new Error("Storage did not return an upload ID");
      uploadId = result.UploadId;
      const accepted = await ctx.runMutation(
        internal.classSessionVideos.attachUpload,
        { id, uploadId: result.UploadId },
      );
      if (!accepted) throw new ConvexError("SESSION_VIDEO_UPLOAD_EXPIRED");
      return { id, partSize: SESSION_VIDEO_PART_BYTES };
    } catch (error) {
      // Compensate even if the provider succeeded but persisting its ID failed.
      if (uploadId) {
        try {
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket,
              Key: sessionVideoObjectKey(id),
              UploadId: uploadId,
            }),
          );
        } catch (cleanupError) {
          console.error(
            "[Session video] allocation cleanup failed",
            cleanupError,
          );
        }
      }
      await ctx.runMutation(internal.classSessionVideos.cancelUpload, { id });
      throw error;
    }
  },
});

export const signParts = action({
  args: { id: v.id("classSessionVideos"), partNumbers: v.array(v.number()) },
  returns: v.array(v.object({ partNumber: v.number(), url: v.string() })),
  handler: async (
    ctx,
    { id, partNumbers },
  ): Promise<{ partNumber: number; url: string }[]> => {
    const video = await uploadContext(ctx, id);
    if (
      video.state !== "uploading" ||
      !video.uploadId ||
      !partNumbers.length ||
      partNumbers.length > 8 ||
      new Set(partNumbers).size !== partNumbers.length ||
      partNumbers.some(
        (number) => sessionVideoPartSize(video.size, number) === null,
      )
    )
      throw new ConvexError("INVALID_SESSION_VIDEO_PART");
    const { client, Bucket } = storage(video.bucket);
    return await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          client,
          new UploadPartCommand({
            Bucket,
            Key: sessionVideoObjectKey(id),
            UploadId: video.uploadId,
            PartNumber: partNumber,
            ContentLength: sessionVideoPartSize(video.size, partNumber)!,
          }),
          { expiresIn: PART_URL_TTL_SECONDS },
        ),
      })),
    );
  },
});

const part = v.object({ partNumber: v.number(), etag: v.string() });
export const complete = action({
  args: { id: v.id("classSessionVideos"), parts: v.array(part) },
  returns: v.null(),
  handler: async (ctx, { id, parts }) => {
    const video = await uploadContext(ctx, id);
    if (video.state === "ready") return null;
    if (
      !video.uploadId ||
      parts.length !== Math.ceil(video.size / SESSION_VIDEO_PART_BYTES) ||
      parts.some(
        (p, i) => p.partNumber !== i + 1 || !p.etag || p.etag.length > 200,
      )
    )
      throw new ConvexError("INVALID_SESSION_VIDEO_PARTS");
    const { client, Bucket } = storage(video.bucket);
    const Key = sessionVideoObjectKey(id);
    try {
      try {
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket,
            Key,
            UploadId: video.uploadId,
            MultipartUpload: {
              Parts: parts.map((p) => ({
                PartNumber: p.partNumber,
                ETag: p.etag,
              })),
            },
          }),
        );
      } catch (error) {
        // A lost completion response may leave a finished object, but no multipart ID.
        if (!(error instanceof Error) || error.name !== "NoSuchUpload")
          throw error;
      }
      const metadata = await client.send(
        new HeadObjectCommand({ Bucket, Key }),
      );
      if (
        metadata.ContentLength !== video.size ||
        metadata.ContentType !== video.contentType
      )
        throw new ConvexError("INVALID_SESSION_VIDEO");
      const header = await client.send(
        new GetObjectCommand({ Bucket, Key, Range: "bytes=0-4095" }),
      );
      if (header.ContentLength === undefined || header.ContentLength > 4096)
        throw new ConvexError("INVALID_SESSION_VIDEO");
      const bytes = await header.Body?.transformToByteArray();
      if (!bytes || (await fileTypeFromBuffer(bytes))?.mime !== "video/mp4")
        throw new ConvexError("INVALID_SESSION_VIDEO");
      await ctx.runMutation(internal.classSessionVideos.commit, { id });
      return null;
    } catch (error) {
      // Retryable network failures retain the staged upload; invalid/conflicting data does not.
      if (error instanceof ConvexError)
        await ctx.runMutation(internal.classSessionVideos.cancelUpload, { id });
      await cleanupVideo(ctx, { id, bucket: video.bucket });
      throw error;
    }
  },
});

export const playback = action({
  args: { id: v.id("classSessionVideos") },
  returns: v.object({ url: v.string(), expiresAt: v.number() }),
  handler: async (ctx, { id }): Promise<{ url: string; expiresAt: number }> => {
    const access = await ctx.runQuery(
      internal.classSessionVideos.playbackContext,
      { id },
    );
    if (
      !access.canPreview &&
      (!access.released || Date.now() < access.scheduledStart)
    )
      throw new ConvexError("PERMISSION_DENIED");
    const { client, Bucket } = storage(access.bucket);
    const expiresAt = Date.now() + PLAYBACK_URL_TTL_SECONDS * 1000;
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket,
        Key: sessionVideoObjectKey(access.keyId),
      }),
      { expiresIn: PLAYBACK_URL_TTL_SECONDS },
    );
    return { url, expiresAt };
  },
});

async function cleanupVideo(
  ctx: ActionCtx,
  {
    id,
    bucket,
    attempt = 0,
  }: { id: Id<"classSessionVideos">; bucket?: string; attempt?: number },
) {
  try {
    const video = await ctx.runQuery(
      internal.classSessionVideos.cleanupContext,
      { id },
    );
    if (video && video.state !== "retired") return null;
    bucket = video?.bucket ?? bucket;
    if (!bucket) return null;
    const { client, Bucket } = storage(bucket);
    const Key = sessionVideoObjectKey(id);
    if (video?.uploadId) {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket,
            Key,
            UploadId: video.uploadId,
          }),
        );
        // An in-flight part may outlive AbortMultipartUpload; retain cleanup until it is gone.
        const remaining = await client.send(
          new ListPartsCommand({
            Bucket,
            Key,
            UploadId: video.uploadId,
            MaxParts: 1,
          }),
        );
        if (remaining.Parts?.length || remaining.IsTruncated)
          throw new Error("Multipart parts are still pending cleanup");
      } catch (error) {
        if (!(error instanceof Error) || error.name !== "NoSuchUpload")
          throw error;
      }
    }
    await client.send(new DeleteObjectCommand({ Bucket, Key }));
    await ctx.runMutation(internal.classSessionVideos.finishCleanup, { id });
  } catch (error) {
    console.error("[Session video] storage cleanup will retry", {
      id,
      attempt,
      error,
    });
    await ctx.scheduler.runAfter(
      Math.min(60 * 60 * 1000, 60_000 * 2 ** Math.min(attempt, 6)),
      internal.classSessionVideoStorage.cleanup,
      { id, bucket, attempt: attempt + 1 },
    );
  }
  return null;
}

export const cleanup = internalAction({
  args: {
    id: v.id("classSessionVideos"),
    bucket: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: cleanupVideo,
});
