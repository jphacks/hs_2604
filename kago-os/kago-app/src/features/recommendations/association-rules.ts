import data from "./association-rules.json";
import type { AssociationRuleSet } from "./association";

// The generated rule set bundled with the App (version is recorded as selections.rule_version).
export const ASSOCIATION_RULES = data as AssociationRuleSet;
