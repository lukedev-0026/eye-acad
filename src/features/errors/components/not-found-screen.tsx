import { Link } from '@tanstack/react-router';

export function NotFoundScreen() {
  return (
    <main className="page narrow">
      <h1>Page not found</h1>
      <p className="lede">There is nothing at this address.</p>
      <Link to="/" className="button">
        Back to the start
      </Link>
    </main>
  );
}
