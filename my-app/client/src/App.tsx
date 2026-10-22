import { useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { RegistrationPanel } from './components/REG/RegistrationPanel';
import { LoginPanel } from './components/REG/LoginPanel';
import { CurrentUserPanel } from './components/REG/CurrentUserPanel';
import CustomerOrders from './pages/CustomerOrders';
import RestaurantDashboard from './pages/RestaurantDashboard';

interface SignedInAccount {
  accountID: number;
  accountName: string;
  email?: string;
  role: string;
}

export function App() {
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<SignedInAccount | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sessionToken'));
  const navigate = useNavigate(); // lets us jump to a page from code

  // Each role has its own home page
  const homeFor = (role: string) => (role === 'restaurant' ? '/restaurant' : '/customer');

  const handleLoginSuccess = (account: SignedInAccount, sessionToken: string) => {
    setCurrentUser(account);
    setToken(sessionToken);
    setFeedback({ message: `Logged in as ${account.accountName} (${account.role})`, isError: false });
    navigate(homeFor(account.role)); // go straight to the right page
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem('sessionToken');
    setFeedback({ message: 'Successfully logged out.', isError: false });
    navigate('/');
  };

  const alertBox = feedback && (
    <div className={`alert ${feedback.isError ? 'alert-error' : 'alert-success'}`}>
      {feedback.message}
    </div>
  );

  // ---------- NOT LOGGED IN: only the login/register screen ----------
  if (!currentUser || !token) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1 className="brand">Sugar Dash</h1>
          {alertBox}

          <div className="auth-tabs">
            <button
              type="button"
              className={`tab ${authTab === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthTab('login'); setFeedback(null); }}
            >
              Log In
            </button>
            <button
              type="button"
              className={`tab ${authTab === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthTab('register'); setFeedback(null); }}
            >
              Register
            </button>
          </div>

          {authTab === 'login' ? (
            <LoginPanel
              onLoginSuccess={handleLoginSuccess}
              onError={(err) => setFeedback({ message: err, isError: true })}
            />
          ) : (
            <RegistrationPanel
              onSuccess={(msg) => {
                setFeedback({ message: `${msg} Please log in below.`, isError: false });
                setAuthTab('login');
              }}
              onError={(err) => setFeedback({ message: err, isError: true })}
            />
          )}
        </div>
      </div>
    );
  }

  // ---------- LOGGED IN: navbar + pages ----------
  return (
    <>
      <nav className="navbar">
        <strong className="navbar-brand">Sugar Dash</strong>
        {currentUser.role === 'customer' && <Link to="/customer">Restaurants &amp; Orders</Link>}
        {currentUser.role === 'restaurant' && <Link to="/restaurant">Restaurant Orders</Link>}
        <CurrentUserPanel account={currentUser} token={token} onLogout={handleLogout} />
      </nav>

      <div className="container">
        <Routes>
          {currentUser.role === 'customer' && (
            <Route path="/customer" element={<CustomerOrders token={token} />} />
          )}
          {currentUser.role === 'restaurant' && (
            <Route path="/restaurant" element={<RestaurantDashboard token={token} />} />
          )}
          {/* Anything else (including "/") goes to this role's home page */}
          <Route path="*" element={<Navigate to={homeFor(currentUser.role)} replace />} />
        </Routes>
      </div>
    </>
  );
}

export default App;