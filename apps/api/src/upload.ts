import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
type Policy = {
  directory?: string;
  memory?: boolean;
  maxBytes: number;
  maxFiles?: number;
  maxFields?: number;
  types?: string[];
};
export async function withUpload(
  c: Context,
  policy: Policy,
  field: string,
  done: (error?: Error & { code?: string }) => unknown,
) {
  try {
    if (!(c.req.header('content-type') ?? '').startsWith('multipart/form-data')) {
      await done();
      return c.res;
    }
    const form = await c.req.formData();
    const files: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      filename?: string;
      path?: string;
    }[] = [];
    const body: Record<string, string> = {};
    for (const [key, value] of form) {
      if (typeof value === 'string') {
        body[key] = value;
        continue;
      }
      if (!value.size && !value.name) continue;
      if (key !== field || files.length >= (policy.maxFiles ?? 1))
        throw new Error('unexpected upload field');
      if (value.size > policy.maxBytes)
        throw Object.assign(new Error('file too large'), { code: 'LIMIT_FILE_SIZE' });
      if (!(policy.types ?? ['image/jpeg', 'image/png']).includes(value.type))
        throw new Error('only jpg/png images are allowed');
      files.push({
        originalname: value.name,
        mimetype: value.type,
        size: value.size,
        buffer: Buffer.from(await value.arrayBuffer()),
      });
    }
    if (Object.keys(body).length > (policy.maxFields ?? 100)) throw new Error('too many fields');
    // Validate the whole form before creating files, avoiding orphaned partial uploads.
    if (!policy.memory)
      for (const file of files) {
        file.filename = `${randomUUID()}${file.mimetype === 'image/jpeg' ? '.jpg' : '.png'}`;
        file.path = path.join(policy.directory!, file.filename);
        await fs.writeFile(file.path, file.buffer!);
        delete file.buffer;
      }
    c.set('body', body);
    c.set('files', files);
    c.set('file', files[0]);
  } catch (error) {
    await done(error as Error);
    return c.res;
  }
  await done();
  return c.res;
}
