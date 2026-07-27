import type {
  EvaluationInstance,
  PassFail,
  RecommendationValue,
  TextboxId,
} from "@/lib/hr/candidate/evaluation-v2";
import type { WeightProfile } from "@/lib/hr/candidate/evaluation-v2-scoring";

/**
 * The single mutation surface handed down to every section component. The screen
 * owns the instance + autosave; sections only call these typed setters. Keeps the
 * tree simple and avoids threading a dozen callbacks per section.
 */
export interface EvalController {
  instance: EvaluationInstance;
  profile: WeightProfile;
  readOnly: boolean;
  setPassfail: (id: string, v: PassFail) => void;
  setRating: (id: string, v: number) => void;
  toggleCantSay: (id: string) => void;
  setNote: (id: string, v: string) => void;
  setSectionNote: (id: string, v: string) => void;
  setXFactor: (v: number) => void;
  setSell: (v: boolean) => void;
  setOverall: (v: number) => void;
  setRecommendation: (v: RecommendationValue) => void;
  setTextbox: (id: TextboxId, v: string) => void;
}
