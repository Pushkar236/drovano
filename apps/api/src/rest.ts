/**
 * Public REST API v1 (TASK-0029, ADR-0005): read paths only, derived from
 * the same services the internal tRPC surface uses. Auth is a per-tenant
 * bearer API key (`drv_…`) — the hash lookup IS the tenant discovery, so
 * this file never trusts a caller-supplied tenant id.
 *
 * Error envelope everywhere: `{ error: { code, message } }`.
 */
import { CrmError, getRecord, queryRecords } from '@drovano/crm';
import { attributeDefinitions, objectDefinitions, withTenant, type Database } from '@drovano/db';
import { findApiKeyBySecret } from '@drovano/platform';
import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';

interface RestEnv {
  Variables: {
    tenantId: string;
  };
}

const EMPTY_CONFIG = { filters: [], sorts: [], columns: [] };

const RecordsQuerySchema = z.object({
  object: z.string().min(1),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

/** Map typed domain errors to precise status codes (CODING_STANDARDS). */
function crmErrorResponse(error: CrmError): {
  status: 400 | 404;
  body: ReturnType<typeof errorBody>;
} {
  return {
    status: error.code === 'unknown-record' || error.code === 'unknown-object' ? 404 : 400,
    body: errorBody(error.code, error.message),
  };
}

export function createRestApi(db: Database): Hono<RestEnv> {
  const rest = new Hono<RestEnv>();

  rest.use('*', async (c, next) => {
    const authorization = c.req.header('authorization') ?? '';
    const secret = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (secret === '') {
      return c.json(
        errorBody('unauthorized', 'Send an API key as `Authorization: Bearer drv_…`.'),
        401,
      );
    }
    const key = await findApiKeyBySecret(db, secret);
    if (key === null) {
      return c.json(errorBody('unauthorized', 'This API key is unknown or revoked.'), 401);
    }
    c.set('tenantId', key.tenantId);
    await next();
  });

  rest.get('/objects', async (c) => {
    const tenantId = c.get('tenantId');
    const result = await withTenant(db, tenantId, async (tx) => {
      const [objects, attributes] = await Promise.all([
        tx
          .select({
            id: objectDefinitions.id,
            key: objectDefinitions.key,
            name: objectDefinitions.name,
            kind: objectDefinitions.kind,
          })
          .from(objectDefinitions)
          .orderBy(asc(objectDefinitions.createdAt)),
        tx
          .select({
            objectId: attributeDefinitions.objectId,
            key: attributeDefinitions.key,
            name: attributeDefinitions.name,
            type: attributeDefinitions.type,
            config: attributeDefinitions.config,
          })
          .from(attributeDefinitions)
          .orderBy(asc(attributeDefinitions.createdAt)),
      ]);
      return objects.map((object) => ({
        ...object,
        attributes: attributes
          .filter((attribute) => attribute.objectId === object.id)
          .map((attribute) => ({
            key: attribute.key,
            name: attribute.name,
            type: attribute.type,
            config: attribute.config,
          })),
      }));
    });
    return c.json({ objects: result });
  });

  rest.get('/records', async (c) => {
    const tenantId = c.get('tenantId');
    const query = RecordsQuerySchema.safeParse({
      object: c.req.query('object'),
      cursor: c.req.query('cursor'),
      limit: c.req.query('limit'),
    });
    if (!query.success) {
      return c.json(
        errorBody('invalid-request', 'Pass ?object=<object key> (cursor and limit optional).'),
        400,
      );
    }

    try {
      const page = await withTenant(db, tenantId, async (tx) => {
        const [object] = await tx
          .select({ id: objectDefinitions.id })
          .from(objectDefinitions)
          .where(eq(objectDefinitions.key, query.data.object))
          .limit(1);
        if (object === undefined) {
          throw new CrmError('unknown-object', `No object with key "${query.data.object}".`);
        }
        return queryRecords(tx, {
          objectId: object.id,
          config: EMPTY_CONFIG,
          cursor: query.data.cursor,
          limit: query.data.limit,
        });
      });
      return c.json(page);
    } catch (error) {
      if (error instanceof CrmError) {
        const mapped = crmErrorResponse(error);
        return c.json(mapped.body, mapped.status);
      }
      throw error;
    }
  });

  rest.get('/records/:id', async (c) => {
    const tenantId = c.get('tenantId');
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) {
      return c.json(errorBody('invalid-request', 'Record ids are UUIDs.'), 400);
    }
    try {
      const record = await withTenant(db, tenantId, (tx) => getRecord(tx, id.data));
      return c.json(record);
    } catch (error) {
      if (error instanceof CrmError) {
        const mapped = crmErrorResponse(error);
        return c.json(mapped.body, mapped.status);
      }
      throw error;
    }
  });

  return rest;
}
