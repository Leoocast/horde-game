import { useTranslation } from "../i18n/useTranslation";

export function LearnToPlayDefeatOutcomeDialog({ narrativeOpen, narrativeAcknowledged, onContemplateFuture }: {
  narrativeOpen: boolean;
  narrativeAcknowledged: boolean;
  onContemplateFuture: () => void;
}) {
  const t = useTranslation();
  return (
    <div className="defeat-outcome">
      <div
        className="defeat-outcome-inner"
        role={narrativeOpen ? undefined : "dialog"}
        aria-modal={narrativeOpen ? undefined : "true"}
        aria-hidden={narrativeOpen || undefined}
        aria-labelledby="learn-to-play-defeat-title"
        aria-describedby="learn-to-play-defeat-description"
      >
        <span className="defeat-kicker">{t("result.defeat")}</span>
        <strong className="defeat-title" id="learn-to-play-defeat-title">
          <span className="line">{t("destiny.futureLostLineOne")}</span>
          <span className="line">{t("destiny.futureLostLineTwo")}</span>
        </strong>
        <span className="defeat-subtitle" id="learn-to-play-defeat-description">
          {t("result.chapterLostAmongShards")}
        </span>

        {narrativeAcknowledged && (
          <div className="defeat-outcome-actions is-single-action learn-to-play-defeat-cta">
            <button
              type="button"
              className="destiny-command-button learn-to-play-contemplate-button"
              onClick={onContemplateFuture}
              aria-describedby="learn-to-play-defeat-description"
            >
              <span className="destiny-command-copy">
                <strong>{t("guided.learnToPlay.defeatCta")}</strong>
              </span>
              <span className="destiny-command-shimmer" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LearnToPlayDefeatNarrativeDialog({ onContinue }: { onContinue: () => void }) {
  const t = useTranslation();
  return (
    <div className="learn-to-play-defeat-dialog-layer">
      <section
        className="learn-to-play-defeat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learn-to-play-narrative-title"
        aria-describedby="learn-to-play-narrative-description"
      >
        <header className="learn-to-play-defeat-dialog-header">
          <h2 id="learn-to-play-narrative-title">{t("guided.learnToPlay.defeatLineOne")}</h2>
        </header>
        <div className="learn-to-play-defeat-dialog-body" id="learn-to-play-narrative-description">
          <p>{t("guided.learnToPlay.defeatLineTwo")}</p>
          <p>{t("guided.learnToPlay.defeatBody")}</p>
        </div>
        <button type="button" className="guided-tutorial-continue" onClick={onContinue}>
          {t("guided.continue")}
        </button>
      </section>
    </div>
  );
}
