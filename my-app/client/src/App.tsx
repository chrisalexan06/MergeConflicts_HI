import { useState } from 'react';
import { RegistrationPanel } from './components/REG/RegistrationPanel';

export function App() {
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

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

      <RegistrationPanel
        onSuccess={(msg) => setFeedback({ message: msg, isError: false })}
        onError={(err) => setFeedback({ message: err, isError: true })}
      />
    </div>
  );
}

export default App;
