import { Effect, Layer } from 'effect'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StorageError } from '@/shared/domain/errors'
import { FileStorage } from '@/shared/application/file-storage'

const client = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  // Garage doesn't support the SDK's default flexible-checksum extension (x-amz-checksum-*),
  // which the SDK otherwise adds to presigned PUT URLs and gets rejected with 400.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
})

const bucket = process.env.S3_BUCKET!

/** Adapter: FileStorage on any S3-compatible service (Garage in prod, MinIO in dev). */
export const S3FileStorage = Layer.succeed(FileStorage, {
  presignPut: (key, contentType) =>
    Effect.tryPromise({
      try: () =>
        getSignedUrl(
          client,
          new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
          { expiresIn: 15 * 60 },
        ),
      catch: (cause) => new StorageError({ cause }),
    }),
  presignGet: (key) =>
    Effect.tryPromise({
      try: () =>
        getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
          expiresIn: 15 * 60,
        }),
      catch: (cause) => new StorageError({ cause }),
    }),
  head: (key) =>
    Effect.tryPromise({
      try: async () => {
        const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return {
          sizeBytes: res.ContentLength ?? 0,
          contentType: res.ContentType ?? 'application/octet-stream',
        }
      },
      catch: (cause) => new StorageError({ cause }),
    }),
  remove: (key) =>
    Effect.tryPromise({
      try: () => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).then(() => undefined),
      catch: (cause) => new StorageError({ cause }),
    }),
})
