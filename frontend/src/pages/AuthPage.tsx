import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === 'login';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, password, name);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', padding: 16 }}>
      <h1>BoardFlow</h1>
      <h2>{isLogin ? 'Log in' : 'Create account'}</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        {!isLogin && (
          <input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p style={{ color: 'crimson', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Please wait...' : isLogin ? 'Log in' : 'Sign up'}
        </button>
      </form>
      <p>
        {isLogin ? (
          <>
            No account? <Link to="/register">Sign up</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login">Log in</Link>
          </>
        )}
      </p>
    </main>
  );
}
