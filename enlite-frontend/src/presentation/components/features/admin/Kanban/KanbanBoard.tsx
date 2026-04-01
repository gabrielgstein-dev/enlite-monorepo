import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import type { FunnelStages } from '@hooks/admin/useEncuadreFunnel';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { DraggableCard } from './DraggableCard';
import { RejectionReasonSelect } from './RejectionReasonSelect';

interface KanbanBoardProps {
  stages: FunnelStages;
  onMove: (encuadreId: string, targetStage: string, rejectionReasonCategory?: string) => Promise<void>;
}

const COLUMN_CONFIG = [
  { id: 'INVITED', color: 'bg-blue-400', droppable: false },
  { id: 'INITIATED', color: 'bg-violet-400', droppable: false },
  { id: 'IN_PROGRESS', color: 'bg-violet-500', droppable: false },
  { id: 'COMPLETED', color: 'bg-violet-600', droppable: false },
  { id: 'CONFIRMED', color: 'bg-cyan-400', droppable: true },
  { id: 'SELECTED', color: 'bg-green-500', droppable: true },
  { id: 'REJECTED', color: 'bg-red-400', droppable: true },
] as const;

// Droppable columns map directly to application_funnel_stage values
const DROPPABLE_STAGES = new Set(['CONFIRMED', 'SELECTED', 'REJECTED']);

export function KanbanBoard({ stages, onMove }: KanbanBoardProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRejectionSelect, setShowRejectionSelect] = useState<{ encuadreId: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Find the active card across all stages
  const activeCard = activeId
    ? Object.values(stages).flat().find((e) => e.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const encuadreId = String(active.id);
    const targetStage = String(over.id);

    if (!DROPPABLE_STAGES.has(targetStage)) return;

    // If moving to REJECTED, show rejection reason select
    if (targetStage === 'REJECTED') {
      setShowRejectionSelect({ encuadreId });
      return;
    }

    await onMove(encuadreId, targetStage);
  }

  async function handleRejectionSubmit(encuadreId: string, category: string) {
    setShowRejectionSelect(null);
    await onMove(encuadreId, 'REJECTED', category);
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMN_CONFIG.map((col) => {
            const items = stages[col.id as keyof FunnelStages] ?? [];
            return (
              <KanbanColumn key={col.id} id={col.id} title={t(`admin.kanban.columns.${col.id}`)} count={items.length} color={col.color} droppable={col.droppable}>
                {items.map((enc) => (
                  <DraggableCard key={enc.id} id={enc.id}>
                    <KanbanCard
                      id={enc.id}
                      workerName={enc.workerName}
                      workerPhone={enc.workerPhone}
                      occupation={enc.occupation}
                      workZone={enc.workZone}
                      matchScore={enc.matchScore}
                      talentumStatus={enc.talentumStatus}
                      rejectionReasonCategory={enc.rejectionReasonCategory}
                      interviewDate={enc.interviewDate}
                      interviewTime={enc.interviewTime}
                    />
                  </DraggableCard>
                ))}
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="opacity-80 rotate-2">
              <KanbanCard
                id={activeCard.id}
                workerName={activeCard.workerName}
                workerPhone={activeCard.workerPhone}
                occupation={activeCard.occupation}
                workZone={activeCard.workZone}
                matchScore={activeCard.matchScore}
                talentumStatus={activeCard.talentumStatus}
                rejectionReasonCategory={activeCard.rejectionReasonCategory}
                interviewDate={activeCard.interviewDate}
                interviewTime={activeCard.interviewTime}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showRejectionSelect && (
        <RejectionReasonSelect
          onSubmit={(category) => handleRejectionSubmit(showRejectionSelect.encuadreId, category)}
          onCancel={() => setShowRejectionSelect(null)}
        />
      )}
    </>
  );
}
