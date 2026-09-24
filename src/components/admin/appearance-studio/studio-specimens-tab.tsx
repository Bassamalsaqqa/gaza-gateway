/**
 * Gaza Gateway — Appearance Studio Design System Specimens Sub-View
 *
 * Retains the 7 live archetype specimens (Flight, Fare, Trip Summary, Passenger Form,
 * Guide Plate, Editorial Card, Review Dossier) as a dedicated Design System Specimens
 * tab within the Appearance Studio.
 */

import { useState } from "react";
import { Columns2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SurfaceGrammarConfig } from "@/design/surfaces/types";
import { DEFAULT_SURFACE_RECIPES } from "@/design/surfaces/presets";
import {
  FlightOptionSpecimen,
  FareOptionSpecimen,
  TripSummarySpecimen,
  PassengerFormSpecimen,
  GuidePlateSpecimen,
  EditorialCardSpecimen,
  ReviewDossierSpecimen,
} from "../surface-lab-specimens";

export interface StudioSpecimensTabProps {
  grammarConfig: SurfaceGrammarConfig;
}

export function StudioSpecimensTab({ grammarConfig }: StudioSpecimensTabProps) {
  const { t, lang } = useI18n();
  const isAr = lang === "ar";
  const [labMode, setLabMode] = useState<"baseline" | "grammar" | "compare">("compare");

  const families = grammarConfig.families ?? DEFAULT_SURFACE_RECIPES;

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">
            {isAr ? "معمل الأسطح والنماذج التوضيحية" : "Design System Specimen Archetypes"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "مقارنة حية بين التصميم القياسي السابق ولغة أسطح غزة (Surface Grammar)"
              : "Direct side-by-side comparison between the legacy card baseline and the Gaza Surface Grammar."}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1">
          <button
            type="button"
            onClick={() => setLabMode("baseline")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              labMode === "baseline"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("a2.skin.lab.mode.baseline")}
          </button>

          <button
            type="button"
            onClick={() => setLabMode("grammar")}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              labMode === "grammar"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("a2.skin.lab.mode.grammar")}
          </button>

          <button
            type="button"
            onClick={() => setLabMode("compare")}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors",
              labMode === "compare"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Columns2 className="size-3.5" />
            <span>{t("a2.skin.lab.mode.compare")}</span>
          </button>
        </div>
      </div>

      {/* Specimens rendering */}
      {labMode === "compare" ? (
        <div className="space-y-10">
          {/* Column labels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2 border-b border-border/80">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-muted-foreground/60" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("a2.skin.lab.mode.baseline")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-brand" />
              <span className="text-xs font-bold uppercase tracking-wider text-brand">
                {t("a2.skin.lab.mode.grammar")}
              </span>
            </div>
          </div>

          {/* 1. Flight Option */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <FlightOptionSpecimen forceGrammar={false} />
            <FlightOptionSpecimen forceGrammar={true} recipe={families.operational} />
          </div>

          {/* 2. Fare Option */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <FareOptionSpecimen forceGrammar={false} />
            <FareOptionSpecimen forceGrammar={true} recipe={families.fare} />
          </div>

          {/* 3. Trip Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <TripSummarySpecimen forceGrammar={false} />
            <TripSummarySpecimen forceGrammar={true} recipe={families.dossier} />
          </div>

          {/* 4. Passenger Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <PassengerFormSpecimen forceGrammar={false} />
            <PassengerFormSpecimen forceGrammar={true} recipe={families["form-sheet"]} />
          </div>

          {/* 5. Guide Plate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <GuidePlateSpecimen forceGrammar={false} />
            <GuidePlateSpecimen forceGrammar={true} recipe={families.guide} />
          </div>

          {/* 6. Editorial Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <EditorialCardSpecimen forceGrammar={false} />
            <EditorialCardSpecimen forceGrammar={true} recipe={families.editorial} />
          </div>

          {/* 7. Review Dossier */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <ReviewDossierSpecimen forceGrammar={false} />
            <ReviewDossierSpecimen forceGrammar={true} recipe={families.dossier} />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <FlightOptionSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.operational}
          />
          <FareOptionSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.fare}
          />
          <TripSummarySpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.dossier}
          />
          <PassengerFormSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families["form-sheet"]}
          />
          <GuidePlateSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.guide}
          />
          <EditorialCardSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.editorial}
          />
          <ReviewDossierSpecimen
            forceGrammar={labMode === "grammar"}
            recipe={families.dossier}
          />
        </div>
      )}
    </div>
  );
}
