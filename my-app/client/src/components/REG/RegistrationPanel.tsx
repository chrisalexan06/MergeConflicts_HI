import React, { useState } from 'react';

interface Props {
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export const RegistrationPanel: React.FC<Props> = ({ onSuccess, onError }) => {
  const [accountName, setAccountName] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('customer');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountName: accountName.trim(),
          password,
          email: email.trim(),
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      onSuccess(`Account successfully registered: ${data.account.accountName} [Role: ${data.account.role}]`);
      setAccountName('');
      setPassword('');
      setEmail('');
    } catch (err: any) {
      onError(err.message || 'Network request failed');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid #ccc',
        padding: '20px',
        borderRadius: '8px',
        maxWidth: '380px',
        backgroundColor: '#fff',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Register New Account</h3>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Username</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="e.g. johndoe"
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Email</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.g. john@example.com"
          required
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Password</label>
        <input
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}>Role</label>
        <select
          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="customer">Customer</option>
          <option value="restaurant">Restaurant Staff</option>
          <option value="courier">Courier</option>
          <option value="operator">Operator</option>
        </select>
      </div>

      <button
        type="submit"
        className="btn btn-block"
      >
        Register
      </button>
    </form>
  );
};