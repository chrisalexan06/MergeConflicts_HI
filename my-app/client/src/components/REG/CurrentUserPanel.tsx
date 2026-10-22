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

export const CurrentUserPanel: React.FC<CurrentUserPanelProps> = ({ account, onLogout }) => {
  return (
    <div className="navbar-user">
      <span>{account.accountName}</span>
      <span className="badge role-badge">{account.role}</span>
      <button type="button" className="btn btn-secondary" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
};