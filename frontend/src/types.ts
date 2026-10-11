export type Role = 'owner' | 'editor' | 'viewer';

export type Member = {
  user_id: number;
  email: string;
  name: string | null;
  role: Role;
};

export type Board = {
  id: number;
  title: string;
  owner_id: number;
  created_at: string;
  role?: Role;
};

export type Card = {
  id: number;
  column_id: number;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
};

export type Column = {
  id: number;
  board_id: number;
  title: string;
  position: number;
  cards: Card[];
};

export type FullBoard = Board & { columns: Column[] };
