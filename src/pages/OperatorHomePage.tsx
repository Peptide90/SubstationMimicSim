import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listScenariosByBand, type AgeBand } from '@scenarios/index';

export function OperatorHomePage() {
  const [band, setBand] = useState<AgeBand>('A');
  const scenarios = useMemo(() => listScenariosByBand(band), [band]);

  return (
    <main className="page">
      <h1>Solo Grid Operator</h1>
      <label>
        Age band:
        <select value={band} onChange={(e) => setBand(e.target.value as AgeBand)}>
          <option value="A">Band A - CO2 + intermittency + interconnectors</option>
          <option value="B">Band B - frequency + contingencies + rerouting</option>
          <option value="C">Band C - advanced protections + reactive margin</option>
        </select>
      </label>

      <h2>Scenarios</h2>
      {scenarios.length === 0 && <p>No scenarios in this age band yet.</p>}
      <ul>
        {scenarios.map((scenario) => (
          <li key={scenario.id}>
            <strong>{scenario.title}</strong> — {scenario.description}
            <div>
              <Link to={`/operator/play/${scenario.id}`} state={{ ageBand: band }}>
                Start
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
