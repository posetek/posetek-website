import { useEffect, useRef } from 'react';
import runnerSvg from './posetek-runner-v2-dark.svg?raw';

/**
 * The page the runner plays in, matching the app's `AICoachRunner` web view (mobile #109): the
 * bundled SVG keeps its own 900 ms stride script and crosses the composer once in 6 s. The page runs
 * in a sandboxed frame with no network access, and reports the end of its pass to this window.
 */
export function runnerDocument(pass: number): string {
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<style>
html,body{margin:0;overflow:hidden;background:transparent}
svg{display:block;width:64px;height:64px;animation:runner-travel 6s linear forwards}
@keyframes runner-travel{from{transform:translateX(-64px)}to{transform:translateX(100vw)}}
@media(prefers-reduced-motion:reduce){svg{animation:none}}
</style>
</head><body>${runnerSvg}
<script>
document.querySelector('svg').addEventListener('animationend', function (event) {
  if (event.animationName === 'runner-travel') parent.postMessage({ posetekCoachRunner: ${Number(pass)} }, '*');
});
</script>
</body></html>`;
}

/** One pass of the runner along the top edge of the composer. Purely decorative. */
export default function CoachRunner({ pass, onFinished }: { pass: number; onFinished: (pass: number) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const finished = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.posetekCoachRunner === pass) onFinished(pass);
    };
    window.addEventListener('message', finished);
    return () => window.removeEventListener('message', finished);
  }, [pass, onFinished]);
  return <iframe ref={frame} className="coach-runner" srcDoc={runnerDocument(pass)} sandbox="allow-scripts"
    aria-hidden="true" tabIndex={-1} title="" data-testid="coach-runner" />;
}
