import React, { useState } from 'react';

interface SignedInAccount {
  accountID: number;
  accountName: string;
  email: string;
  role: string;
}

interface Props {
  onLoginSuccess: (account: SignedInAccount, token: string) => void;
  onError: (error: string) => void;
}

export const LoginPanel: React.FC<Props> = ({ onLoginSuccess, onError }) => {
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountName: accountName.trim(), password }),
      });

      const data = await res.json() as { sessionToken: string; account: SignedInAccount; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      localStorage.setItem('sessionToken', data.sessionToken);
      onLoginSuccess(data.account, data.sessionToken);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', padding: '24px', borderRadius: '8px', maxWidth: '380px' }}>
      <h2 style={{ marginTop: 0 }}>Log In</h2>
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Username</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="seed_customer"
          required
        />
      </div>
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px' }}>Password</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="pass123"
          required
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="btn btn-block"
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
};