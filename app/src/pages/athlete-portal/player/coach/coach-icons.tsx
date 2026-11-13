/* The app's V4 AI icons (KickAI/Assets.xcassets/v4-ai-*.imageset), drawn inline so they take the text color. */

const stroke = { stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function HistoryIcon() {
  return <svg className="coach-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
    <path d="M15 9C15 12.3137 12.3137 15 9 15C5.68629 15 3 12.3137 3 9C3 5.68629 5.68629 3 9 3C12.3137 3 15 5.68629 15 9Z" {...stroke} />
    <path d="M9 5.25V9L11.25 10.5" {...stroke} />
  </svg>;
}

export function MemoryIcon() {
  return <svg className="coach-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
    <path d="M9 2.25L10.65 7.35L15.75 9L10.65 10.65L9 15.75L7.35 10.65L2.25 9L7.35 7.35L9 2.25Z" {...stroke} />
  </svg>;
}

export function SharingIcon() {
  return <svg className="coach-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
    <path d="M9 2.25L15 4.5V9C15 12.75 9 15.75 9 15.75C9 15.75 3 12.75 3 9V4.5L9 2.25Z" {...stroke} />
    <path d="M6 9L8.25 11.25L12 6.75" {...stroke} />
  </svg>;
}

export function SendIcon() {
  return <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true" focusable="false">
    <path d="M11 17.4167V4.58333M16.5 10.0833L11 4.58333L5.5 10.0833" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
