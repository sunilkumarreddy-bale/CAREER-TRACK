import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';

export default function NotFound() {
  return (
    <EmptyState icon="alert" title="Page not found" action={<Link to="/" className="btn btn-primary">Go to dashboard</Link>}>
      The page you're looking for doesn't exist.
    </EmptyState>
  );
}
