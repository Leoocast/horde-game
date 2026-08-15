import { Copy, Orbit, RefreshCcw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useTranslation } from "../i18n/useTranslation";
import { useToastStore } from "../store/useToastStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";

type Props = {
  seed: string;
  onRewrite: () => void;
  onContemplateAnother: () => void;
};

export function DestinyRewriteControl({ seed, onRewrite, onContemplateAnother }: Props) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const modalPresence = useAnimatedPresence(open, 220);
  const futureCode = futureCodeFromSeed(seed);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function copyIdentity() {
    try {
      await navigator.clipboard.writeText(seed);
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
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        className="destiny-command-button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("destiny.open", { code: futureCode })}
      >
        <span className="destiny-command-glyph" aria-hidden="true"><Orbit size={23} strokeWidth={1.55} /></span>
        <span className="destiny-command-copy">
          <small>{t("destiny.future", { code: futureCode })}</small>
          <strong>{t("destiny.rewrite")}</strong>
        </span>
        <span className="destiny-command-shimmer" aria-hidden="true" />
      </button>

      {modalPresence.mounted && (
        <div
          className={["destiny-dialog-backdrop fixed inset-0 z-[450] flex items-center justify-center p-6", modalPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            className={["destiny-dialog old-panel w-full max-w-[540px]", modalPresence.closing ? "is-closing" : ""].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="destiny-dialog-title"
          >
            <button className="destiny-dialog-close" type="button" onClick={() => setOpen(false)} aria-label={t("common.close")}>
              <X size={18} />
            </button>

            <div className="destiny-dialog-sigil" aria-hidden="true"><Orbit size={42} strokeWidth={1.2} /></div>
            <div className="destiny-dialog-kicker">{t("destiny.future", { code: futureCode })}</div>
            <h2 id="destiny-dialog-title">{t("destiny.dialogTitle")}</h2>
            <p>{t("destiny.dialogBody")}</p>

            <button className="destiny-dialog-primary" type="button" onClick={() => choose(onRewrite)} autoFocus>
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
