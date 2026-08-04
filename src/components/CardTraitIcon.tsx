import {
  Eye,
  Feather,
  FlaskConical,
  Ghost,
  HeartPulse,
  Shield,
  Skull,
  Sparkles,
  Users,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cardTraitIconPresentation, type CardTraitIconKind } from "./cardTraitPresentation";

const TRAIT_ICON_BY_KIND: Record<CardTraitIconKind, LucideIcon> = {
  alert: Eye,
  daunting: Users,
  drain: HeartPulse,
  fallback: Sparkles,
  flying: Feather,
  furtive: Ghost,
  impetus: Sparkles,
  lethal: Skull,
  overflow: Waves,
  poison: FlaskConical,
  reflex: Zap,
  skyguard: Shield,
};

export function CardTraitIcon({
  keyword,
  showAmount = false,
}: {
  keyword: string;
  showAmount?: boolean;
}) {
  const presentation = cardTraitIconPresentation(keyword);
  const Icon = TRAIT_ICON_BY_KIND[presentation.kind];

  return (
    <>
      <Icon className="card-trait-label-icon" aria-hidden="true" />
      {showAmount && presentation.amount !== undefined && (
        <small aria-hidden="true">{presentation.amount}</small>
      )}
    </>
  );
}
