import { DEFAULT_CLASSIFICATION_RULES } from '../shared/classifierRules';
import type { ClassificationRule, TrainingFeedbackExample } from '../shared/types';

const RULES_STORAGE_KEY = 'nexamail_classification_rules_v6';
const LEGACY_RULES_KEYS = [
  'nexamail_classification_rules_v5',
  'nexamail_classification_rules_v4',
  'nexamail_classification_rules_v3',
  'nexamail_classification_rules_v2',
  'nexamail_classification_rules_v1',
];
const FEEDBACK_STORAGE_KEY = 'nexamail_training_feedback_v1';

export function loadStoredRules(): ClassificationRule[] {
  try {
    const raw = window.localStorage.getItem(RULES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClassificationRule[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }

    // Migrate custom rules and user-added senders while refreshing system default definitions
    for (const legacyKey of LEGACY_RULES_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const legacy = JSON.parse(legacyRaw) as ClassificationRule[];
      if (Array.isArray(legacy) && legacy.length > 0) {
        const defaultIds = new Set(DEFAULT_CLASSIFICATION_RULES.map((r) => r.id));
        const upgradedDefaults = DEFAULT_CLASSIFICATION_RULES.map((defRule) => {
          const prev = legacy.find((r) => r.id === defRule.id);
          if (!prev) return defRule;
          return {
            ...defRule,
            senders: Array.from(new Set([...defRule.senders, ...prev.senders])),
            // For spam, adopt the updated precise keywords (drops legacy broad newsletter keywords like "unsubscribe")
            keywords:
              defRule.id === 'spam'
                ? [...defRule.keywords]
                : Array.from(new Set([...defRule.keywords, ...prev.keywords])),
          };
        });
        const customRules = legacy.filter((r) => !defaultIds.has(r.id));
        const merged = [...upgradedDefaults, ...customRules];
        saveStoredRules(merged);
        return merged;
      }
    }

    return DEFAULT_CLASSIFICATION_RULES;
  } catch {
    return DEFAULT_CLASSIFICATION_RULES;
  }
}

export function saveStoredRules(rules: ClassificationRule[]): void {
  try {
    window.localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Ignore storage quota issues gracefully
  }
}

export function resetStoredRules(): ClassificationRule[] {
  try {
    window.localStorage.removeItem(RULES_STORAGE_KEY);
    for (const legacyKey of LEGACY_RULES_KEYS) {
      window.localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore
  }
  return DEFAULT_CLASSIFICATION_RULES;
}

export function loadStoredFeedback(): TrainingFeedbackExample[] {
  try {
    const raw = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrainingFeedbackExample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStoredFeedback(examples: TrainingFeedbackExample[]): void {
  try {
    window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(examples));
  } catch {
    // Ignore
  }
}
