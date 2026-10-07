/**
 * Gaza Gateway — Central Admin Audit Orchestrator (Phase 6C)
 *
 * Provides the unified convention for recording administrative activity.
 *
 * Architectural Invariants:
 * - Domain repositories remain decoupled from React and AdminProvider.
 * - Public passenger actions are never audited with fabricated staff actors.
 * - Failed domain commands produce NO audit events.
 * - Genuine no-ops produce NO duplicate audit events.
 * - Separate-store non-ACID truth: Domain commits FIRST, audit appends SECOND.
 *   If audit append fails, domain remains committed and truthful feedback is emitted.
 */

import type { ActivityActorSnapshot, ActivityRepository, CreateActivityInput } from "./types.ts";

export interface AuditedCommandOptions<T> {
  domainCommand: () => Promise<T>;
  activityRepo: ActivityRepository;
  actor: ActivityActorSnapshot | null | undefined;
  event?:
    | Omit<CreateActivityInput, "actor">
    | ((result: T) => Omit<CreateActivityInput, "actor">)
    | undefined;
  isNoOp?: (result: T) => boolean;
  onAuditWarning?: (msg: string) => void;
}

/**
 * Executes an administrative domain command and records an audit event upon success.
 *
 * If the domain command fails, the error propagates and NO audit event is created.
 * If the domain command succeeds but audit logging fails, the domain change remains
 * committed and an audit warning is reported.
 */
export async function executeAuditedAdminCommand<T>(
  options: AuditedCommandOptions<T>,
): Promise<T> {
  // Capture detached actor and static event inputs BEFORE domain await
  const detachedActor: ActivityActorSnapshot | null = options.actor
    ? structuredClone(options.actor)
    : null;
  const staticEvent =
    options.event && typeof options.event !== "function"
      ? structuredClone(options.event)
      : null;

  // 1. Execute domain command FIRST
  const result = await options.domainCommand();

  // 2. Suppress audit for genuine no-ops
  if (options.isNoOp && options.isNoOp(result)) {
    return result;
  }

  // 3. Record audit event SECOND (only if an authenticated staff actor and event are present)
  if (detachedActor && options.event) {
    try {
      const eventPayload =
        typeof options.event === "function"
          ? structuredClone(options.event(result))
          : staticEvent!;
      await options.activityRepo.append({
        actor: detachedActor,
        ...eventPayload,
      });
    } catch (auditErr) {
      console.warn("Admin domain command committed, but audit append failed:", auditErr);
      if (options.onAuditWarning) {
        options.onAuditWarning("audit_append_failed");
      }
    }
  }

  return result;
}

/**
 * Direct audit recording helper for already-committed administrative actions
 * (such as successful authentication / sign-in).
 */
export async function recordAdminAudit(
  activityRepo: ActivityRepository,
  actor: ActivityActorSnapshot | null | undefined,
  event: Omit<CreateActivityInput, "actor">,
  onAuditWarning?: (msg: string) => void,
): Promise<boolean> {
  if (!actor) return false;

  const detachedActor = structuredClone(actor);
  const detachedEvent = structuredClone(event);

  try {
    await activityRepo.append({
      actor: detachedActor,
      ...detachedEvent,
    });
    return true;
  } catch (err) {
    console.warn("Failed to record admin audit event:", err);
    if (onAuditWarning) {
      onAuditWarning("audit_append_failed");
    }
    return false;
  }
}
