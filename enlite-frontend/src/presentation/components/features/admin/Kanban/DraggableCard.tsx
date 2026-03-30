import { useDraggable } from '@dnd-kit/core';

interface DraggableCardProps {
  id: string;
  children: React.ReactNode;
}

export function DraggableCard({ id, children }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`kanban-card-${id}`}
      className={isDragging ? 'opacity-30' : ''}
      {...listeners}
      {...attributes}
    >
      {children}
    </div>
  );
}
