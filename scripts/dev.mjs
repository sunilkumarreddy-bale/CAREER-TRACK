// Runs the API and the Vite dev server together: `npm run dev`
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'dev', '-w', 'server']],
  ['web', ['run', 'dev', '-w', 'client']],
].map(([name, args]) => {
  const p = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    procs.forEach((other) => other !== p && other.kill());
    process.exit(code ?? 0);
  });
  return p;
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
