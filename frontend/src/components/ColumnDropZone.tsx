import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';

export default function ColumnDropZone({
  columnId,
  children,
}: {
  columnId: number;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `column-${columnId}`, data: { type: 'column' } });
  return (
    <ul
      ref={setNodeRef}
      style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8, minHeight: 24 }}
    >
      {children}
    </ul>
  );
}
