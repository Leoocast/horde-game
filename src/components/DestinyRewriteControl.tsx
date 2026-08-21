import { Copy, Orbit, RefreshCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { useToastStore } from "../store/useToastStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";

type Props = {
  seed: string;
  onRewrite: () => void;
  onContemplateAnother: () => void;
  initiallyOpen?: boolean;
  hideLauncher?: boolean;
  onDismiss?: () => void;
};

export function DestinyRewriteControl({ seed, onRewrite, onContemplateAnother, initiallyOpen = false, hideLauncher = false, onDismiss }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const [open, setOpenState] = useState(initiallyOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(true);
  const dialogWasMountedRef = useRef(false);
  const modalPresence = useAnimatedPresence(open, 220);
  const futureCode = futureCodeFromSeed(seed);

  function setOpen(next: boolean) {
    setOpenState(next);
    if (!next) onDismiss?.();
  }

  useEffect(() => {
    if (!open) return;
    // También cubre el montaje doble de StrictMode: el segundo efecto recupera el foco dentro.
    const focusFrame = window.requestAnimationFrame(() => {
      primaryActionRef.current?.focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])") ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (modalPresence.mounted) {
      dialogWasMountedRef.current = true;
      return;
    }
    if (!dialogWasMountedRef.current) return;
    dialogWasMountedRef.current = false;
    if (restoreFocusRef.current) triggerRef.current?.focus({ preventScroll: true });
  }, [modalPresence.mounted]);

  async function copyIdentity() {
    try {
      await writeClipboardText(seed);
      pushToast({
        title: t("destiny.identityCopied"),
        message: t("destiny.future", { code: futureCode }),
        tone: "success",
      });
    } catch {
      pushToast({
        title: t("destiny.identityCopyFailed"),
        message: t("destiny.future", { code: futureCode }),
        tone: "warning",
      });
    }
  }

  function choose(action: () => void) {
    // Durante el vórtice no devolvemos el foco a un control que enseguida quedará tras el overlay.
    restoreFocusRef.current = false;
    setOpen(false);
    action();
  }

  function openDialog() {
    restoreFocusRef.current = true;
    setOpen(true);
  }

  return (
    <>
      {!hideLauncher && <button
        ref={triggerRef}
        className="destiny-command-button"
        type="button"
        onClick={openDialog}
        aria-label={t("destiny.open", { code: futureCode })}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="destiny-command-glyph" aria-hidden="true"><Orbit size={23} strokeWidth={1.55} /></span>
        <span className="destiny-command-copy">
          <small>{t("destiny.future", { code: futureCode })}</small>
          <strong>{t("destiny.rewrite")}</strong>
        </span>
        <span className="destiny-command-shimmer" aria-hidden="true" />
      </button>}

      {modalPresence.mounted && (
        <div
          className={["destiny-dialog-backdrop fixed inset-0 z-[450] flex items-center justify-center p-6", modalPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            ref={dialogRef}
            className={["destiny-dialog hf-ui-panel w-full max-w-[540px]", modalPresence.closing ? "is-closing" : ""].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="destiny-dialog-title"
            aria-describedby="destiny-dialog-description"
          >
            <button className="destiny-dialog-close" type="button" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              <X size={18} />
            </button>

            <div className="destiny-dialog-sigil" aria-hidden="true"><Orbit size={42} strokeWidth={1.2} /></div>
            <div className="destiny-dialog-kicker">{t("destiny.future", { code: futureCode })}</div>
            <h2 id="destiny-dialog-title">{t("destiny.dialogTitle")}</h2>
            <p id="destiny-dialog-description">{t("destiny.dialogBody")}</p>

            <button ref={primaryActionRef} className="destiny-dialog-primary" type="button" onClick={() => choose(onRewrite)} autoFocus>
              <RefreshCcw size={18} />
              <span>{t("destiny.rewriteThis")}</span>
            </button>

            <div className="destiny-dialog-divider" aria-hidden="true"><span />◆<span /></div>

            <button className="destiny-dialog-secondary" type="button" onClick={() => choose(onContemplateAnother)}>
              <Sparkles size={17} />
              <span>{t("destiny.contemplateAnother")}</span>
            </button>

            <button className="destiny-dialog-copy" type="button" onClick={copyIdentity}>
              <Copy size={14} />
              <span>{t("destiny.copyIdentity")}</span>
            </button>
          </section>
        </div>
      )}
    </>
  );
}
