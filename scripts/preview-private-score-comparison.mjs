import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { scoreComparisonFixture } from './fixtures/private-parent-score-comparison.mjs';
import { sealReport } from './seal-parent-report.mjs';

const report = sealReport(scoreComparisonFixture);
const assets = new Map([
  ['index.html', 'text/html'], ['report.css', 'text/css'], ['render.mjs', 'text/javascript'],
  ['crypto.mjs', 'text/javascript'], ['loader.mjs', 'text/javascript'],
]);

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://127.0.0.1');
  const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  try {
    if (pathname === '/api/one-pager-event') return response.writeHead(204).end();
    if (pathname === '/signin') return response.writeHead(200, { ...headers, 'Content-Type': 'text/plain' }).end('Synthetic signup destination');
    if (pathname === `/report/data/${report.id}.bin`) {
      return response.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream' }).end(report.envelope);
    }
    const file = pathname === '/report/' ? 'index.html' : pathname.slice('/report/'.length);
    if (!pathname.startsWith('/report/') || !assets.has(file)) return response.writeHead(404).end();
    const body = await readFile(new URL(`../app/private-report/${file}`, import.meta.url));
    response.writeHead(200, { ...headers, 'Content-Type': assets.get(file) }).end(body);
  } catch {
    response.writeHead(500).end();
  }
});
server.listen(0, '127.0.0.1', () => console.log(
  `Synthetic preview: http://127.0.0.1:${server.address().port}/report/#${report.fragment}`));
