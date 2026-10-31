"use node";

import { v } from "convex/values";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const removeFiles = internalAction({
  args: { occurrenceId: v.id("eventOccurrences"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const accessKeyId = process.env.S3_ACCESS_KEY;
      const secretAccessKey = process.env.S3_SECRET_KEY;
      const region = process.env.S3_REGION;
      const bucket = process.env.S3_BUCKET;
      const endpoint = process.env.S3_ENDPOINT;
      if (!accessKeyId || !secretAccessKey || !region || !bucket || !endpoint)
        throw new Error("Recording storage configuration is incomplete");
      const client = new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      });
      const prefix = `recordings/${args.occurrenceId}/`;
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 100,
        }),
      );
      const keys = (page.Contents ?? [])
        .map((item) => item.Key)
        .filter((key): key is string => Boolean(key));
      if (keys.length) {
        for (const key of keys)
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key }),
          );
        await ctx.scheduler.runAfter(
          0,
          internal.eventRecordingCleanup.removeFiles,
          {
            occurrenceId: args.occurrenceId,
            attempt: 0,
          },
        );
      } else {
        await ctx.runMutation(internal.events.markRecordingsCleaned, {
          occurrenceId: args.occurrenceId,
        });
      }
    } catch (error) {
      console.error("[Event recording cleanup]", args.occurrenceId, error);
      await ctx.scheduler.runAfter(
        Math.min(3_600_000, 1_000 * 2 ** Math.min(args.attempt, 12)),
        internal.eventRecordingCleanup.removeFiles,
        { occurrenceId: args.occurrenceId, attempt: args.attempt + 1 },
      );
    }
    return null;
  },
});
