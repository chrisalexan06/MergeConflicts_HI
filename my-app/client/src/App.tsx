import { useState } from 'react';
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
  // 1. All useState hooks grouped at the top
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [currentUser, setCurrentUser] = useState<SignedInAccount | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sessionToken'));
  const [showRestaurantTest, setShowRestaurantTest] = useState(false);

  // 2. Handlers declared after the state setters exist
  const handleLoginSuccess = (account: SignedInAccount, sessionToken: string) => {
    setCurrentUser(account);
    setToken(sessionToken);
    setFeedback({ message: `Logged in as ${account.accountName} (${account.role})`, isError: false });
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken(null);
    localStorage.removeItem('sessionToken');
    setFeedback({ message: 'Successfully logged out.', isError: false });
  };

  // 3. Clean JSX without stray closing tags
  return (
    <div style={{ padding: '32px', fontFamily: 'sans-serif', maxWidth: '450px', margin: '0 auto' }}>
      <h2>Sugar Dash</h2>

      {feedback && (
        <div
          style={{
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '6px',
            backgroundColor: feedback.isError ? '#ffeef0' : '#e6ffed',
            color: feedback.isError ? '#d73a49' : '#22863a',
            border: `1px solid ${feedback.isError ? '#f97583' : '#34d058'}`,
            fontSize: '14px',
          }}
        >
          {feedback.message}
        </div>
      )}

      {currentUser && token ? (
        <>
          <CurrentUserPanel
            account={currentUser}
            token={token}
            onLogout={handleLogout}
          />
          {currentUser.role === 'restaurant' ? (
            <RestaurantDashboard token={token} />
          ) : currentUser.role === 'customer' && showRestaurantTest ? (
            <>
              <button type="button" onClick={() => setShowRestaurantTest(false)}>
                Back to account
              </button>
              <CustomerOrders token={token} />
            </>
          ) : currentUser.role === 'customer' ? (
            <button type="button" onClick={() => setShowRestaurantTest(true)}>
              View restaurants and menus (R-ORD-01)
            </button>
          ) : null}
        </>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setFeedback(null);
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                backgroundColor: authTab === 'login' ? '#0070f3' : '#f0f0f0',
                color: authTab === 'login' ? '#fff' : '#333',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setFeedback(null);
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #ccc',
                backgroundColor: authTab === 'register' ? '#0070f3' : '#f0f0f0',
                color: authTab === 'register' ? '#fff' : '#333',
                fontWeight: 600,
                cursor: 'pointer',
              }}
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
      )}
    </div>
  );
}

export default App;