import { Copy } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { writeClipboardText } from "../platform/desktopBridge";
import { useToastStore } from "../store/useToastStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { GameTooltip } from "./GameTooltip";

export function DestinyCopyIdentityButton({ canonCode }: Readonly<{ canonCode: string }>) {
  const t = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const futureCode = futureCodeFromSeed(canonCode);

  async function copyIdentity() {
    try {
      await writeClipboardText(canonCode);
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

  return (
    <GameTooltip content={t("destiny.copyIdentity")} side="bottom">
      <button
        className="game-header-button destiny-copy-identity-button flex h-10 w-10 items-center justify-center transition"
        type="button"
        onClick={copyIdentity}
        aria-label={t("destiny.copyIdentity")}
      >
        <Copy size={18} strokeWidth={1.8} />
      </button>
    </GameTooltip>
  );
}
