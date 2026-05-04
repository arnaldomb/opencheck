import { S3Client, PutObjectCommand, HeadBucketCommand, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3'

const BUCKET     = process.env.MINIO_BUCKET      ?? 'snapshots'
const ENDPOINT   = process.env.MINIO_ENDPOINT    ?? 'http://minio:9000'
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL  ?? process.env.MINIO_ENDPOINT ?? 'http://localhost:9000'

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
  },
  forcePathStyle: true,
})

const PUBLIC_POLICY = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{
    Effect: 'Allow',
    Principal: { AWS: ['*'] },
    Action: ['s3:GetObject'],
    Resource: [`arn:aws:s3:::${BUCKET}/*`],
  }],
})

export async function ensureStorageBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
    console.log(`[storage] Bucket "${BUCKET}" criado`)
  }
  // Ensure public read policy is always applied (idempotent)
  await s3.send(new PutBucketPolicyCommand({ Bucket: BUCKET, Policy: PUBLIC_POLICY }))
}

// Download image from a temporary URL (e.g. EZVIZ picUrl) and store in MinIO.
// Returns the permanent MinIO URL.
export async function uploadFromUrl(imageUrl: string, key: string): Promise<string> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: 'image/jpeg',
  }))

  return `${PUBLIC_URL}/${BUCKET}/${key}`
}
