import { Link, Route, Routes } from 'react-router-dom';
import { OperatorHomePage } from './pages/OperatorHomePage';
import { OperatorPlayPage } from './pages/OperatorPlayPage';
import { OperatorDebriefPage } from './pages/OperatorDebriefPage';

export function App() {
  return (
    <div>
      <header className="top-nav">
        <span>GridGame</span>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/operator">Operator Mode</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<div className="page">Existing modes untouched. Use Operator Mode.</div>} />
        <Route path="/operator" element={<OperatorHomePage />} />
        <Route path="/operator/play/:scenarioId" element={<OperatorPlayPage />} />
        <Route path="/operator/debrief/:runId" element={<OperatorDebriefPage />} />
      </Routes>
    </div>
  );
}
