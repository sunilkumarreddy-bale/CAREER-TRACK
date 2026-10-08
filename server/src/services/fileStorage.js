import mongoose from 'mongoose';
import { Readable } from 'node:stream';

// Resume files live in MongoDB GridFS so the app stays stateless and deployable
// on hosts without a persistent disk.
const BUCKET = 'resumes';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });

export function saveFile(buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(filename, { metadata });
    Readable.from(buffer)
      .pipe(upload)
      .on('error', reject)
      .on('finish', () => resolve(upload.id));
  });
}

export const openDownloadStream = (fileId) => bucket().openDownloadStream(fileId);

export async function deleteFile(fileId) {
  try {
    await bucket().delete(fileId);
  } catch (err) {
    // Already gone is fine; anything else is a real failure.
    if (!/FileNotFound|File not found/i.test(err.message)) throw err;
  }
}
