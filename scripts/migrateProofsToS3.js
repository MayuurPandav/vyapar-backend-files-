const { getDB, connect } = require('../config/db');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { ObjectId } = require('mongodb');

async function main() {
  await connect();
  const db = getDB();
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  if (!bucket) {
    console.error('AWS_S3_BUCKET not set. Aborting.');
    process.exit(1);
  }
  const client = new S3Client({ region });

  const cursor = db.collection('deliveries').find({ proof: { $exists: true, $ne: [] } });
  let count = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const updates = [];
    for (let i = 0; i < (doc.proof || []).length; i++) {
      const p = doc.proof[i];
      if (p.data && typeof p.data === 'string' && p.data.startsWith('data:')) {
        // parse base64
        const m = p.data.match(/^data:(.+);base64,(.+)$/);
        if (!m) continue;
        const contentType = m[1];
        const b64 = m[2];
        const buffer = Buffer.from(b64, 'base64');
        const ext = contentType.split('/').pop().split(';')[0] || 'bin';
        const key = `deliveries/${doc._id}/${Date.now().toString().slice(-8)}-${i}.${ext}`;
        const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType });
        await client.send(cmd);
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
        updates.push({ index: i, url, key });
      }
    }
    if (updates.length) {
      const newProof = (doc.proof || []).map((p, idx) => {
        const u = updates.find(x => x.index === idx);
        if (u) {
          return Object.assign({}, p, { url: u.url, s3Key: u.key, data: undefined });
        }
        return p;
      });
      await db.collection('deliveries').updateOne({ _id: doc._id }, { $set: { proof: newProof, updatedAt: new Date().toISOString() } });
      count += updates.length;
      console.log(`Migrated ${updates.length} proofs for delivery ${doc._id}`);
    }
  }
  console.log(`Migration complete. Total migrated proofs: ${count}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
