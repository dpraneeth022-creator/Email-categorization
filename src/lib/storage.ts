import { DEFAULT_CLASSIFICATION_RULES } from '../shared/classifierRules';
import type { ClassificationRule, TrainingFeedbackExample } from '../shared/types';

const RULES_STORAGE_KEY = 'nexamail_classification_rules_v7';
const LEGACY_RULES_KEYS = [
  'nexamail_classification_rules_v6',
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

    // Migrate custom rules cleanly while adopting the strict v7 system default rules
    for (const legacyKey of LEGACY_RULES_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      const legacy = JSON.parse(legacyRaw) as ClassificationRule[];
      if (Array.isArray(legacy) && legacy.length > 0) {
        const defaultIds = new Set(DEFAULT_CLASSIFICATION_RULES.map((r) => r.id));
        const customRules = legacy.filter((r) => !defaultIds.has(r.id));
        const merged = [...DEFAULT_CLASSIFICATION_RULES, ...customRules];
        saveStoredRules(merged);
        return merged;
      }
    }

    saveStoredRules(DEFAULT_CLASSIFICATION_RULES);
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
