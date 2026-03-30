import { useState } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import type { FunnelStages } from '@hooks/admin/useEncuadreFunnel';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { DraggableCard } from './DraggableCard';
import { RejectionReasonSelect } from './RejectionReasonSelect';

interface KanbanBoardProps {
  stages: FunnelStages;
  onMove: (encuadreId: string, resultado: string, rejectionReasonCategory?: string) => Promise<void>;
}

const COLUMN_CONFIG = [
  { id: 'INVITED', title: 'Invitados', color: 'bg-blue-400', resultado: null },
  { id: 'CONFIRMED', title: 'Confirmados', color: 'bg-cyan-400', resultado: null },
  { id: 'INTERVIEWING', title: 'Entrevistando', color: 'bg-amber-400', resultado: null },
  { id: 'SELECTED', title: 'Seleccionados', color: 'bg-green-500', resultado: 'SELECCIONADO' },
  { id: 'REJECTED', title: 'Rechazados', color: 'bg-red-400', resultado: 'RECHAZADO' },
  { id: 'PENDING', title: 'Pendientes', color: 'bg-gray-400', resultado: 'PENDIENTE' },
] as const;

// Map column IDs to encuadre resultado values for moves
const COLUMN_TO_RESULTADO: Record<string, string> = {
  SELECTED: 'SELECCIONADO',
  REJECTED: 'RECHAZADO',
  PENDING: 'PENDIENTE',
  INVITED: 'REPROGRAMAR',
};

export function KanbanBoard({ stages, onMove }: KanbanBoardProps) {
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
    const targetColumn = String(over.id);
    const resultado = COLUMN_TO_RESULTADO[targetColumn];

    if (!resultado) return;

    // If moving to REJECTED, show rejection reason select
    if (targetColumn === 'REJECTED') {
      setShowRejectionSelect({ encuadreId });
      return;
    }

    await onMove(encuadreId, resultado);
  }

  async function handleRejectionSubmit(encuadreId: string, category: string) {
    setShowRejectionSelect(null);
    await onMove(encuadreId, 'RECHAZADO', category);
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMN_CONFIG.map((col) => {
            const items = stages[col.id as keyof FunnelStages] ?? [];
            return (
              <KanbanColumn key={col.id} id={col.id} title={col.title} count={items.length} color={col.color}>
                {items.map((enc) => (
                  <DraggableCard key={enc.id} id={enc.id}>
                    <KanbanCard
                      id={enc.id}
                      workerName={enc.workerName}
                      workerPhone={enc.workerPhone}
                      occupation={enc.occupation}
                      workZone={enc.workZone}
                      matchScore={enc.matchScore}
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
