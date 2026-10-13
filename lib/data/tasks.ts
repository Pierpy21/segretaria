import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import { tasks, type Task as TaskRow } from "@/drizzle/schema";
import type { ColumnId } from "@/app/types/maintenance";
import type { BoardTask, CreateTaskInput, UpdateTaskInput } from "@/app/types/api";
import { NotFoundError } from "@/lib/errors";
import { assertUuid, first } from "./format";

type TaskColumn = TaskRow["columnId"];

const COLUMN_TO_DB: Record<ColumnId, TaskColumn> = {
  todo: "todo",
  "in-progress": "in_progress",
  done: "done",
};

const COLUMN_FROM_DB: Record<TaskColumn, ColumnId> = {
  todo: "todo",
  in_progress: "in-progress",
  done: "done",
};

/** L'assegnatario della UI è testo libero ("Dott. Renzi"): vive in custom_metadata.assignedTo */
function assigneeOf(meta: unknown): string | undefined {
  const value = (meta as { assignedTo?: unknown } | null)?.assignedTo;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toBoardTask(row: TaskRow): BoardTask {
  return {
    id: row.id,
    title: row.title,
    priority: row.priority,
    ai: row.isAi,
    description: row.description,
    assignedTo: assigneeOf(row.customMetadata),
    columnId: COLUMN_FROM_DB[row.columnId],
    position: row.position,
  };
}

export async function listTasks(tx: Tx, companyId: string): Promise<BoardTask[]> {
  const rows = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.companyId, companyId))
    .orderBy(asc(tasks.columnId), asc(tasks.position));
  return rows.map(toBoardTask);
}

/** Posizione = max+1 nella colonna, calcolata come sottoselect dentro lo stesso INSERT (1 round-trip). */
export async function createTask(tx: Tx, companyId: string, input: CreateTaskInput): Promise<BoardTask> {
  const columnId = COLUMN_TO_DB[input.columnId];

  const inserted = await tx
    .insert(tasks)
    .values({
      companyId,
      title: input.title,
      description: input.description ?? "",
      priority: input.priority,
      columnId,
      position: sql<number>`(select coalesce(max(${tasks.position}), -1) + 1 from ${tasks} where ${and(
        eq(tasks.companyId, companyId),
        eq(tasks.columnId, columnId)
      )})`,
      isAi: false,
      customMetadata: input.assignedTo ? { assignedTo: input.assignedTo } : {},
    })
    .returning();
  return toBoardTask(first(inserted, "insert tasks"));
}

export async function updateTask(tx: Tx, companyId: string, id: string, patch: UpdateTaskInput): Promise<BoardTask> {
  assertUuid(id, "id attività");

  const existingRows = await tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.companyId, companyId)))
    .limit(1);
  const existing = existingRows[0];
  if (!existing) throw new NotFoundError("Attività non trovata");

  const meta = { ...(existing.customMetadata as Record<string, unknown>) };
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo.trim()) meta.assignedTo = patch.assignedTo;
    else delete meta.assignedTo;
  }

  const updated = await tx
    .update(tasks)
    .set({
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      priority: patch.priority ?? existing.priority,
      columnId: patch.columnId ? COLUMN_TO_DB[patch.columnId] : existing.columnId,
      position: patch.position ?? existing.position,
      customMetadata: meta,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.companyId, companyId)))
    .returning();
  return toBoardTask(first(updated, "update tasks"));
}

/** Ritorna false se l'attività non esiste nello studio. */
export async function deleteTask(tx: Tx, companyId: string, id: string): Promise<boolean> {
  assertUuid(id, "id attività");
  const deleted = await tx
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.companyId, companyId)))
    .returning({ id: tasks.id });
  return deleted.length > 0;
}
