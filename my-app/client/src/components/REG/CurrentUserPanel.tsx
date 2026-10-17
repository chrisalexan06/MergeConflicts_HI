import React from 'react';

export interface CurrentUserPanelProps {
  account: {
    accountID: number;
    accountName: string;
    role: string;
    email?: string;
  };
  token: string;
  onLogout: () => void;
}

export const CurrentUserPanel: React.FC<CurrentUserPanelProps> = ({ account, token, onLogout }) => {
  return (
    <div
      style={{
        border: '1px solid #e1e4e8',
        borderRadius: '8px',
        padding: '20px',
        backgroundColor: '#f6f8fa',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '12px', color: '#24292e' }}>
        Active Session
      </h3>

      <div style={{ marginBottom: '8px', fontSize: '14px' }}>
        <strong>Username:</strong> {account.accountName}
      </div>

      <div style={{ marginBottom: '8px', fontSize: '14px' }}>
        <strong>Role:</strong>{' '}
        <span
          style={{
            backgroundColor: '#0366d6',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            textTransform: 'capitalize',
          }}
        >
          {account.role}
        </span>
      </div>

      {account.email && (
        <div style={{ marginBottom: '8px', fontSize: '14px' }}>
          <strong>Email:</strong> {account.email}
        </div>
      )}

      <div
        style={{
          marginTop: '12px',
          marginBottom: '16px',
          padding: '8px',
          backgroundColor: '#fff',
          border: '1px solid #e1e4e8',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          color: '#586069',
        }}
      >
        <strong>Session Token:</strong>
        <br />
        {token}
      </div>

      <button
        type="button"
        onClick={onLogout}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#d73a49',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Log Out
      </button>
    </div>
  );
};