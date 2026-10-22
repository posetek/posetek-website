import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Native modality contains keyboard focus and makes the underlying workspace inert. */
export default function AdminModal({ label, onClose, dismissDisabled = false, drawer = false, children }: {
  label: string;
  onClose: () => void;
  dismissDisabled?: boolean;
  drawer?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Callback identity and draft edits must not reopen the dialog or move focus.
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node.showModal();
    panel.current?.focus({ preventScroll: true });
    return () => {
      node.close();
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, []);

  return <dialog ref={dialog} aria-label={label} aria-modal="true"
    className={`admin-modal ${drawer ? "ai-drawer-backdrop" : "admin-dialog-backdrop"}`}
    onCancel={event => { event.preventDefault(); if (!dismissDisabled) onClose(); }}
    onClickCapture={event => {
      // Safari does not focus buttons on pointer activation. Keep subsequent
      // keyboard navigation and draft rerenders anchored to that control.
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button:not(:disabled),a[href],summary') : null;
      if (target && event.currentTarget.contains(target)) target.focus({ preventScroll: true });
    }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])',
      )].filter(element => element.tabIndex >= 0 && element.getClientRects().length && !element.closest('[hidden],[inert]'));
      const index = items.indexOf(document.activeElement as HTMLElement);
      // Native modality excludes the page, but browsers can still tab to their
      // own chrome at either end. Keep the review's keyboard loop explicit.
      event.preventDefault();
      if (!items.length) panel.current?.focus();
      else items[index === -1 ? event.shiftKey ? items.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }}
    onClick={event => { if (drawer && !dismissDisabled && event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} tabIndex={-1} className={drawer ? "ai-drawer" : "admin-dialog"}>{children}</div>
  </dialog>;
}
