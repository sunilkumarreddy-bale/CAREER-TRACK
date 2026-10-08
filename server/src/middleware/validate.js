import mongoose from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v) && /^[a-f\d]{24}$/i.test(v), {
  message: 'Invalid id',
});

export const idParams = z.object({ id: objectId });

/** Validates and replaces req[part] with the parsed (coerced, stripped) value. */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const [part, schema] of Object.entries(schemas)) {
      const parsed = schema.parse(req[part]);
      // req.query is a getter in some Express setups; define it explicitly.
      Object.defineProperty(req, part, { value: parsed, writable: true, configurable: true, enumerable: true });
    }
    next();
  } catch (err) {
    next(err);
  }
};
