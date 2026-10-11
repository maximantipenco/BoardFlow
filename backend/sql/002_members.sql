CREATE TYPE board_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE board_members (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role board_role NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

-- Existing owners become members with the owner role
INSERT INTO board_members (board_id, user_id, role)
SELECT id, owner_id, 'owner' FROM boards;