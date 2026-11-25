import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { RegistrationPanel } from './components/REG/RegistrationPanel';
import { LoginPanel } from './components/REG/LoginPanel';
import { CurrentUserPanel } from './components/REG/CurrentUserPanel';
import CustomerOrders from './pages/CustomerOrders';
import RestaurantDashboard from './pages/RestaurantDashboard';
import CourierDashboard from './pages/CourierDashboard';
import OperatorDashboard from './pages/OperatorDashboard';

interface SignedInAccount {
  accountID: number;
  accountName: string;
  email?: string;
  role: string;
}

function isSignedInAccount(value: unknown): value is SignedInAccount {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const account = value as Record<string, unknown>;
  return Number.isSafeInteger(account.accountID)
    && typeof account.accountName === 'string'
    && typeof account.role === 'string'
    && (account.email === undefined || typeof account.email === 'string');
}

export function App() {
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<SignedInAccount | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sessionToken'));
  const [authLoading, setAuthLoading] = useState(() => Boolean(localStorage.getItem('sessionToken')));
  const [authError, setAuthError] = useState<string | null>(null);
  const authRequestId = useRef(0);
  const navigate = useNavigate(); // lets us jump to a page from code

  const verifySession = useCallback(async (sessionToken: string | null) => {
    const requestId = ++authRequestId.current;
    setAuthError(null);

    if (!sessionToken) {
      setCurrentUser(null);
      setToken(null);
      setAuthLoading(false);
      return;
    }

    setToken(sessionToken);
    setAuthLoading(true);

    try {
      const response = await fetch('http://localhost:3000/api/auth/me', {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const data = await response.json() as { user?: unknown; error?: string };

      if (response.status === 401) {
        if (localStorage.getItem('sessionToken') === sessionToken) {
          localStorage.removeItem('sessionToken');
        }
        if (requestId === authRequestId.current) {
          setCurrentUser(null);
          setToken(null);
        }
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Could not verify the saved session.');
      }
      if (!isSignedInAccount(data.user)) {
        throw new Error('The server returned an invalid session account.');
      }
      if (requestId === authRequestId.current) {
        setCurrentUser(data.user);
      }
    } catch (error: unknown) {
      if (requestId === authRequestId.current) {
        setCurrentUser(null);
        setAuthError(error instanceof Error ? error.message : 'Could not restore the saved session.');
      }
    } finally {
      if (requestId === authRequestId.current) {
        setAuthLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'sessionToken' || event.key === null) {
        void verifySession(event.key === null ? null : event.newValue);
      }
    };

    window.addEventListener('storage', handleStorage);
    queueMicrotask(() => {
      if (active) {
        void verifySession(localStorage.getItem('sessionToken'));
      }
    });

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorage);
    };
  }, [verifySession]);

  // Each role has its own home page
  const homeFor = (role: string) => {
    if (role === 'restaurant') return '/restaurant';
    if (role === 'courier') return '/courier';
    if (role === 'operator') return '/operator';
    return '/customer';
  };

  const handleLoginSuccess = (account: SignedInAccount, sessionToken: string) => {
    setCurrentUser(account);
    setToken(sessionToken);
    setAuthError(null);
    setFeedback({ message: `Logged in as ${account.accountName} (${account.role})`, isError: false });
    navigate(homeFor(account.role)); // go straight to the right page
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem('sessionToken');
    setAuthError(null);
    setFeedback({ message: 'Successfully logged out.', isError: false });
    navigate('/');
  };

  const alertBox = feedback && (
    <div className={`alert ${feedback.isError ? 'alert-error' : 'alert-success'}`}>
      {feedback.message}
    </div>
  );

  if (authLoading) {
    return (
      <div className="auth-page">
        <div className="card auth-card" role="status">Restoring your session...</div>
      </div>
    );
  }

  // ---------- NOT LOGGED IN: only the login/register screen ----------
  if (!currentUser || !token) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h1 className="brand">Sugar Dash</h1>
          {alertBox}
          {authError && (
            <div className="alert alert-error" role="alert">
              <span>{authError}</span>
              <button
                type="button"
                onClick={() => void verifySession(localStorage.getItem('sessionToken'))}
              >
                Retry session check
              </button>
            </div>
          )}

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
        {currentUser.role === 'courier' && <Link to="/courier">Courier Dashboard</Link>}
        {currentUser.role === 'operator' && <Link to="/operator">City operations</Link>}
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
          {currentUser.role === 'courier' && (
            <Route path="/courier" element={<CourierDashboard token={token} />} />
          )}
          {currentUser.role === 'operator' && (
            <Route path="/operator" element={<OperatorDashboard token={token} />} />
          )}
          {/* Anything else (including "/") goes to this role's home page */}
          <Route path="*" element={<Navigate to={homeFor(currentUser.role)} replace />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
