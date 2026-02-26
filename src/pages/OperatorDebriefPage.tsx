import { Link, useParams } from 'react-router-dom';

export function OperatorDebriefPage() {
  const { runId } = useParams();
  return (
    <main className="page">
      <h1>Run Debrief</h1>
      <p>Run ID: {runId}</p>
      <p>Timeline, metrics, and replay panel are stubbed in v1 scaffold.</p>
      <Link to="/operator">Back to scenarios</Link>
    </main>
  );
}
