import "server-only";
import { Prisma, type AuditAction, type Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface AuditInput {
  storeId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  traceId?: string | null;
}

/**
 * Audit log for the important operations. Never throws: a failed audit write
 * must not block the business operation, but it is logged so it stays visible.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        storeId: input.storeId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        before: (input.before ?? {}) as Prisma.InputJsonValue,
        after: (input.after ?? {}) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        traceId: input.traceId ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] scrierea a esuat:", error);
  }
}
