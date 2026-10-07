import { useAuth } from '../auth';

export default function BoardsPage() {
  const { user, logout } = useAuth();
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>My boards</h1>
        <div>
          {user?.name ?? user?.email} <button onClick={logout}>Log out</button>
        </div>
      </header>
      <p>Boards will be here soon.</p>
    </main>
  );
}