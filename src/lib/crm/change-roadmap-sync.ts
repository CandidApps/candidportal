import type { ChangeStatus } from '@/lib/services/product-change-requests';
import {
  itemSnapshot,
  mapRoadmapItem,
  type RoadmapItem,
  type RoadmapStatus,
} from '@/lib/services/product-roadmap';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/** Map change-request status to a timeline item status (when linked). */
export function roadmapStatusForChangeStatus(status: ChangeStatus): RoadmapStatus | null {
  if (status === 'done') return 'done';
  if (status === 'in_progress') return 'in_progress';
  return null;
}

/** Whether we should apply the mapped status to the linked timeline item. */
export function shouldSyncRoadmapStatus(
  currentItemStatus: RoadmapStatus,
  nextFromChange: RoadmapStatus,
): boolean {
  if (currentItemStatus === nextFromChange) return false;
  if (currentItemStatus === 'done') return false;
  if (nextFromChange === 'in_progress' && currentItemStatus !== 'planned') return false;
  return true;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** When a CR status changes, update linked timeline item (milestone_id → product_roadmap_items). */
export async function syncLinkedRoadmapItemFromChange(
  admin: AdminClient,
  roadmapItemId: string | null,
  changeStatus: ChangeStatus,
  changePublicId: string,
  actorEmail: string | null,
): Promise<void> {
  if (!roadmapItemId) return;

  const nextStatus = roadmapStatusForChangeStatus(changeStatus);
  if (!nextStatus) return;

  const { data: row } = await admin
    .from('product_roadmap_items')
    .select('*')
    .eq('id', roadmapItemId)
    .maybeSingle();

  if (!row) return;

  const before = mapRoadmapItem(row);
  if (!shouldSyncRoadmapStatus(before.status, nextStatus)) return;

  await admin.from('product_roadmap_items').update({ status: nextStatus }).eq('id', roadmapItemId);

  const after: RoadmapItem = { ...before, status: nextStatus };
  await admin.from('product_roadmap_events').insert({
    item_id: roadmapItemId,
    event_type: 'status_changed',
    summary: `${before.title}: ${before.status} → ${nextStatus} (via ${changePublicId})`,
    before_state: itemSnapshot(before),
    after_state: itemSnapshot(after),
    actor_email: actorEmail,
  });
}

/** Label for timeline item picker (milestones + tasks). */
export function formatTimelineItemLabel(
  item: RoadmapItem,
  parent?: RoadmapItem | null,
): string {
  const kind = item.kind === 'task' ? 'Task' : item.kind === 'milestone' ? 'Milestone' : 'Objective';
  const phase = item.phase || parent?.phase;
  const prefix = phase ? `${phase} · ` : '';
  if (item.kind === 'task' && parent) {
    return `${prefix}${parent.title} → ${item.title}`;
  }
  return `${prefix}${kind}: ${item.title}`;
}
