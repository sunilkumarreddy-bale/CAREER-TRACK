import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registeredClient, useTestApp } from './helpers.js';

const ctx = useTestApp('resumes');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

const upload = (c, { buf = PDF, name = 'Resume_SDE_v3.pdf', type = 'application/pdf', label } = {}) => {
  const req = c.post('/api/resumes').attach('file', buf, { filename: name, contentType: type });
  return label ? req.field('label', label) : req;
};

describe('resumes', () => {
  it('uploads, lists, downloads, renames and deletes a resume', async () => {
    const c = await registeredClient(ctx.app);
    const up = await upload(c, { label: 'SDE v3' });
    assert.equal(up.status, 201);
    const resume = up.body.resume;
    assert.equal(resume.label, 'SDE v3');
    assert.equal(resume.size, PDF.length);

    const app = (await c.post('/api/applications').send({ company: 'Google', position: 'SDE', resume: resume._id })).body.application;
    assert.equal(app.resume.label, 'SDE v3');

    const list = (await c.get('/api/resumes')).body.items;
    assert.equal(list.length, 1);
    assert.equal(list[0].applicationsCount, 1);

    const dl = await c.get(`/api/resumes/${resume._id}/download`).buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(dl.status, 200);
    assert.ok(Buffer.compare(dl.body, PDF) === 0);
    assert.match(dl.headers['content-disposition'], /attachment; filename="Resume_SDE_v3.pdf"/);

    const renamed = await c.patch(`/api/resumes/${resume._id}`).send({ label: 'SDE v4' });
    assert.equal(renamed.body.resume.label, 'SDE v4');

    assert.equal((await c.delete(`/api/resumes/${resume._id}`)).status, 204);
    assert.equal((await c.get(`/api/applications/${app.id}`)).body.application.resume, null);
    assert.equal((await c.get(`/api/resumes/${resume._id}/download`)).status, 404);
  });

  it('defaults the label to the file name', async () => {
    const c = await registeredClient(ctx.app);
    const up = await upload(c, { name: 'My CV.pdf' });
    assert.equal(up.body.resume.label, 'My CV');
  });

  it('rejects disallowed or spoofed files', async () => {
    const c = await registeredClient(ctx.app);
    assert.equal((await upload(c, { name: 'evil.exe', type: 'application/x-msdownload' })).status, 400);
    assert.equal((await upload(c, { name: 'evil.pdf', buf: Buffer.from('MZ not a pdf') })).status, 400);
    assert.equal((await upload(c, { name: 'cv.docx' })).status, 400, 'extension must match the MIME type');
    assert.equal((await c.post('/api/resumes')).status, 400);
  });

  it('rejects files above the size limit', async () => {
    const c = await registeredClient(ctx.app);
    const big = Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]);
    assert.equal((await upload(c, { buf: big })).status, 413);
  });

  it('prevents linking or downloading another user\'s resume', async () => {
    const alice = await registeredClient(ctx.app);
    const bob = await registeredClient(ctx.app);
    const resume = (await upload(alice)).body.resume;
    assert.equal((await bob.get(`/api/resumes/${resume._id}/download`)).status, 404);
    assert.equal((await bob.delete(`/api/resumes/${resume._id}`)).status, 404);
    const res = await bob.post('/api/applications').send({ company: 'X', position: 'Y', resume: resume._id });
    assert.equal(res.status, 400);
  });
});
