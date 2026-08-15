// Заливает архив игровых JSON в S3 и оставляет только последние KEEP штук.
// Запускается внутри memories-app-1: там уже есть и aws-sdk, и S3_* из .env.
// У games своего S3-клиента нет, а тянуть aws-sdk в next-образ ради крона — перебор.
const fs = require('fs')
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3')

const KEEP = 14
const PREFIX = 'backups-games/'

const [file, key] = process.argv.slice(2)
if (!file || !key) {
  console.error('usage: backup-upload.js <file> <s3-key>')
  process.exit(1)
}

const bucket = process.env.S3_BUCKET
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'auto',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
})

async function main() {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.readFileSync(file),
    ContentType: 'application/gzip',
  }))
  console.log(`uploaded ${key}`)

  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }))
  const objects = (listed.Contents ?? []).sort((a, b) => a.Key.localeCompare(b.Key))
  while (objects.length > KEEP) {
    const victim = objects.shift()
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: victim.Key }))
    console.log(`pruned ${victim.Key}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
