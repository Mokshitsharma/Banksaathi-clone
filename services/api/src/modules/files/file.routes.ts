import { Router } from 'express';
import { hmac, safeEqual } from '../../lib/crypto';
import { forbidden, notFound } from '../../lib/errors';
import { LocalStorageProvider, storage } from '../../providers/storage';

/** Serves locally stored files only through expiring HMAC-signed URLs (dev replacement for S3 pre-signed URLs). */
export const fileRouter = Router();

fileRouter.get('/*key', (req, res) => {
  if (!(storage instanceof LocalStorageProvider)) throw notFound();
  const key = ([] as string[]).concat(req.params.key as unknown as string[]).join('/');
  const expires = Number(req.query.expires);
  const sig = String(req.query.sig ?? '');
  if (!Number.isFinite(expires) || expires < Date.now() / 1000) throw forbidden('Link expired');
  if (!safeEqual(sig, hmac(`${key}:${expires}`))) throw forbidden('Invalid signature');
  res.setHeader('Cache-Control', 'private, no-store');
  storage.resolve(key); // throws on path traversal
  res.sendFile(key, { root: storage.root }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  });
});
