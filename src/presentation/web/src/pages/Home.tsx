import { Link } from 'react-router-dom';
import './Home.css';

export function Home() {
  return (
    <section className="home-page">
      <h1>Welcome to Second Life Commerce</h1>
      <p className="home-subtitle">
        An intelligent returns-and-resale platform. Try the zero-touch return flow below.
      </p>

      <div className="demo-card">
        <h2>Demo Order</h2>
        <p>View your delivered order and start a return to see the AI grading flow in action.</p>
        <Link to="/orders/order-item-001" className="btn btn-primary">
          View Order Details
        </Link>
      </div>
    </section>
  );
}
