import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '../types';

type Props = {
  card: Card;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
  overlay?: boolean;
};

export default function CardItem({ card, onEdit, onDelete, overlay }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card-${card.id}`,
    data: { type: 'card', card },
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging && !overlay ? 0.4 : 1,
        background: 'white',
        borderRadius: 6,
        padding: 8,
        boxShadow: '0 1px 2px #0003',
        listStyle: 'none',
      }}
    >
      <div {...attributes} {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
        <div>{card.title}</div>
        {card.description && <small style={{ color: '#555' }}>{card.description}</small>}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <button onClick={() => onEdit(card)}>Edit</button>
        <button onClick={() => onDelete(card)}>Delete</button>
      </div>
    </li>
  );
}
