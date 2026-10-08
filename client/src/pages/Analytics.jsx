import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { PageLoader } from '../components/Spinner.jsx';
import StatCard from '../components/StatCard.jsx';
import { useApi } from '../hooks/useApi.js';
import { STATUSES } from '../utils/constants.js';
import { monthLabel } from '../utils/format.js';
import { Pipeline } from './Dashboard.jsx';

// Fixed hex values: recharts renders SVG attributes where CSS variables are not reliable everywhere.
const COLORS = {
  Applied: '#6366f1',
  Screening: '#f59e0b',
  Interview: '#0ea5e9',
  'Final Round': '#a855f7',
  Offer: '#16a34a',
  Rejected: '#ef4444',
};
const ACCENT = '#5b3fd6';
const tooltipStyle = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' } };

export default function Analytics() {
  const [months, setMonths] = useState(6);
  const { data, error, loading, reload } = useApi('/analytics', { months });

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;

  const { summary, monthly, interviewsByRound, resumePerformance, interviewOutcomes } = data;
  const monthlyData = monthly.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const statusData = STATUSES.map((s) => ({ name: s, value: summary.byStatus[s] })).filter((d) => d.value > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Every rate below is a share of all {summary.total} applications.</p>
        </div>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Time range">
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </select>
      </div>

      {summary.total === 0 ? (
        <EmptyState icon="chart" title="No data yet">
          Add applications to see your conversion rates and trends.
        </EmptyState>
      ) : (
        <>
          <section className="stats">
            <StatCard label="Applications" value={summary.total} hint={`${summary.active} still active`} />
            <StatCard label="Response rate" value={`${summary.rates.response}%`} hint="Moved past Applied" tone="info" />
            <StatCard label="Interview rate" value={`${summary.rates.interview}%`} hint={`${summary.interviews} reached interviews`} tone="info" />
            <StatCard label="Offer rate" value={`${summary.rates.offer}%`} hint={`${summary.offers} offers`} tone="success" />
            <StatCard label="Rejection rate" value={`${summary.rates.rejection}%`} hint={`${summary.rejections} rejections`} tone="danger" />
          </section>

          <section className="card">
            <h2>Current pipeline</h2>
            <Pipeline byStatus={summary.byStatus} total={summary.total} />
          </section>

          <div className="grid-2">
            <section className="card chart-card">
              <h2>Applications per month</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(91,63,214,0.08)' }} />
                  <Legend />
                  <Bar isAnimationActive={false} dataKey="applications" name="Applications" fill={ACCENT} radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="interviews" name="Reached interview" fill={COLORS.Interview} radius={[4, 4, 0, 0]} />
                  <Bar isAnimationActive={false} dataKey="offers" name="Offers" fill={COLORS.Offer} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="card chart-card">
              <h2>Interview conversion trend</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis unit="%" domain={[0, 100]} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}%`} />
                  <Line isAnimationActive={false} type="monotone" dataKey="interviewRate" name="Interview rate" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section className="card chart-card">
              <h2>Status distribution</h2>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie isAnimationActive={false} data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                    {statusData.map((d) => (
                      <Cell key={d.name} fill={COLORS[d.name]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} formatter={(v, n) => [`${v} (${Math.round((v / summary.total) * 100)}%)`, n]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </section>

            <section className="card chart-card">
              <h2>Interviews by round</h2>
              {interviewsByRound.length === 0 ? (
                <p className="muted">No interviews recorded yet.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={interviewsByRound} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                      <YAxis type="category" dataKey="round" width={90} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                      <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(91,63,214,0.08)' }} />
                      <Bar isAnimationActive={false} dataKey="count" name="Interviews" fill={ACCENT} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="muted small">
                    Outcomes: {['Passed', 'Failed', 'Pending', 'Cancelled'].map((o) => `${o} ${interviewOutcomes[o] ?? 0}`).join(' · ')}
                  </p>
                </>
              )}
            </section>
          </div>

          <section className="card">
            <h2>Resume performance</h2>
            {resumePerformance.length === 0 ? (
              <p className="muted">Link resumes to applications to compare which version gets more interviews.</p>
            ) : (
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Resume</th>
                    <th>Applications</th>
                    <th>Reached interview</th>
                    <th>Offers</th>
                    <th>Interview rate</th>
                  </tr>
                </thead>
                <tbody>
                  {resumePerformance.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Resume">{r.label}</td>
                      <td data-label="Applications">{r.applications}</td>
                      <td data-label="Reached interview">{r.interviews}</td>
                      <td data-label="Offers">{r.offers}</td>
                      <td data-label="Interview rate">
                        <div className="meter">
                          <span style={{ width: `${r.interviewRate}%` }} />
                        </div>
                        {r.interviewRate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
