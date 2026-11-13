import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles.css';
import './autoCapital.js'; // First Letter Of Every Word Capital, in every text box

// Shows the error and a Reload button instead of a blank white page if something breaks.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="notice err" style={{ display: 'block' }}>
          <b>Something went wrong on this page.</b>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{String(this.state.error?.message || this.state.error)}</pre>
          <button className="primary" onClick={() => window.location.reload()}>Reload</button>{' '}
          <button onClick={() => { window.location.href = '/'; }}>Go to Home</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
