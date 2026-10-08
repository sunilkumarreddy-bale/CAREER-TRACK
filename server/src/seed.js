/* Creates (or resets) a demo account populated with sample data.
   Usage: npm run seed  → demo@careertrack.app / Demo@12345 */
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { Application, Interview, Resume, User } from './models/index.js';
import { deleteFile, saveFile } from './services/fileStorage.js';
import { DAY_MS, STATUSES } from './utils/constants.js';

const DEMO_EMAIL = 'demo@careertrack.app';
const DEMO_PASSWORD = 'Demo@12345';

function minimalPdf(title) {
  const body = `BT /F1 18 Tf 72 720 Td (${title}) Tj ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const daysAgo = (n) => new Date(Date.now() - n * DAY_MS);
const daysAhead = (n, hour, minute = 0) => {
  const d = new Date(Date.now() + n * DAY_MS);
  d.setHours(hour, minute, 0, 0);
  return d;
};

// [company, position, location, salary, daysAgoApplied, finalStatus, resumeKey]
const SAMPLE = [
  ['Google', 'Backend Engineer', 'Bangalore', '₹32 LPA', 40, 'Final Round', 'sde'],
  ['Zoho', 'Developer', 'Chennai', '₹8 LPA', 38, 'Interview', 'sde'],
  ['TCS', 'SDE Intern', 'Hyderabad', '₹25k/month', 36, 'Applied', 'intern'],
  ['Infosys', 'Developer', 'Mysore', '₹6.5 LPA', 30, 'Screening', 'sde'],
  ['Wipro', 'Project Engineer', 'Bangalore', '₹6 LPA', 29, 'Screening', 'sde'],
  ['Amazon', 'SDE', 'Hyderabad', '₹28 LPA', 27, 'Interview', 'sde'],
  ['Microsoft', 'Software Engineer', 'Hyderabad', '₹30 LPA', 25, 'Interview', 'sde'],
  ['Razorpay', 'Backend Engineer', 'Bangalore', '₹22 LPA', 60, 'Final Round', 'sde'],
  ['Adobe', 'SDE', 'Noida', '₹26 LPA', 70, 'Offer', 'sde'],
  ['Byju\'s', 'SDE Intern', 'Bangalore', '₹20k/month', 75, 'Rejected', 'intern'],
  ['Swiggy', 'Data Analyst', 'Bangalore', '₹12 LPA', 90, 'Rejected', 'data'],
  ['Accenture', 'Associate Software Engineer', 'Pune', '₹4.5 LPA', 100, 'Offer', 'sde'],
  ['Flipkart', 'SDE 1', 'Bangalore', '₹24 LPA', 110, 'Rejected', 'sde'],
  ['PhonePe', 'Data Analyst', 'Bangalore', '₹14 LPA', 120, 'Applied', 'data'],
  ['Freshworks', 'Developer Intern', 'Chennai', '₹30k/month', 130, 'Rejected', 'intern'],
];

function historyFor(finalStatus, appliedAt) {
  const path = finalStatus === 'Rejected' ? ['Applied', 'Screening', 'Rejected'] : STATUSES.slice(0, STATUSES.indexOf(finalStatus) + 1);
  return path.map((status, i) => ({ status, changedAt: new Date(appliedAt.getTime() + i * 4 * DAY_MS) }));
}

async function main() {
  await connectDB(env.MONGODB_URI);

  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    const old = await Resume.find({ user: existing._id });
    await Promise.all(old.map((r) => deleteFile(r.fileId)));
    await Promise.all([
      Resume.deleteMany({ user: existing._id }),
      Interview.deleteMany({ user: existing._id }),
      Application.deleteMany({ user: existing._id }),
    ]);
    await existing.deleteOne();
  }

  const user = await User.create({ name: 'Demo Student', email: DEMO_EMAIL, password: DEMO_PASSWORD });

  const resumes = {};
  for (const [key, label, file] of [
    ['sde', 'SDE v3', 'Resume_SDE_v3.pdf'],
    ['data', 'Data Analyst v2', 'Resume_Data_v2.pdf'],
    ['intern', 'Internship v1', 'Resume_Intern_v1.pdf'],
  ]) {
    const buf = minimalPdf(`${user.name} - ${label}`);
    const fileId = await saveFile(buf, file, { user: user._id, mimeType: 'application/pdf' });
    resumes[key] = await Resume.create({ user: user._id, label, originalName: file, mimeType: 'application/pdf', size: buf.length, fileId });
  }

  const apps = {};
  for (const [company, position, location, salary, ago, status, resumeKey] of SAMPLE) {
    const appliedDate = daysAgo(ago);
    const statusHistory = historyFor(status, appliedDate);
    // Four active applications are deliberately stale so the follow-up reminders have something to show.
    const STALE = { Infosys: 9, Wipro: 7, TCS: 12, PhonePe: 15 };
    const lastActivityAt = STALE[company] !== undefined ? daysAgo(STALE[company]) : daysAgo(ago % 3);
    apps[company] = await Application.create({
      user: user._id,
      company,
      position,
      location,
      salary,
      appliedDate,
      status,
      statusHistory: statusHistory.map((h) => ({ ...h, changedAt: h.changedAt > new Date() ? new Date() : h.changedAt })),
      lastActivityAt,
      resume: resumes[resumeKey]._id,
      jobLink: `https://careers.example.com/${company.toLowerCase().replace(/[^a-z]/g, '')}`,
    });
  }

  await Interview.insertMany([
    { user: user._id, application: apps.Google._id, round: 'Final', scheduledAt: daysAhead(3, 11), mode: 'Online', location: 'https://meet.example.com/google-final' },
    { user: user._id, application: apps.Zoho._id, round: 'Technical', scheduledAt: daysAhead(6, 10, 30), mode: 'On-site', location: 'Zoho Estancia, Chennai' },
    { user: user._id, application: apps.Microsoft._id, round: 'HR', scheduledAt: daysAhead(9, 15), mode: 'Phone' },
    { user: user._id, application: apps.Amazon._id, round: 'Online Test', scheduledAt: daysAgo(5), outcome: 'Passed' },
    { user: user._id, application: apps.Razorpay._id, round: 'Technical', scheduledAt: daysAgo(20), outcome: 'Passed' },
    { user: user._id, application: apps.Adobe._id, round: 'Final', scheduledAt: daysAgo(50), outcome: 'Passed' },
    { user: user._id, application: apps.Flipkart._id, round: 'Technical', scheduledAt: daysAgo(95), outcome: 'Failed' },
  ]);

  console.log(`Seeded demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
