import { Component } from 'react';

// If one screen breaks, the customer sees a calm message and a way back,
// not a blank white page. The file is still saved on the device.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('PrintHub screen error:', error, info && info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="start">
        <h1 className="start-title">Something went wrong on this screen</h1>
        <p className="start-sub">Your file is safe. Go back and try again. If it keeps happening, send this message to the shop:</p>
        <p className="error">{String(this.state.error.message || this.state.error)}</p>
        <button type="button" className="primary" onClick={() => { window.location.hash = ''; window.location.reload(); }}>
          Start again
        </button>
      </main>
    );
  }
}
