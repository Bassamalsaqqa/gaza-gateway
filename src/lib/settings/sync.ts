/**
 * Pure settings synchronization logic for clean/dirty admin editors.
 * Compares incoming external saved baseline against the editor's current saved baseline
 * and working state, determining whether to adopt the new draft, retain local edits,
 * transition to clean, or flag a real external conflict.
 */

export interface ExternalSyncResult<T> {
  /** True only if incomingSaved actually differs from currentSaved for this document */
  hasSavedChanged: boolean;
  /** The new saved baseline for this document */
  nextSaved: T | null;
  /** The new working state (either adopted baseline, or preserved local edits) */
  nextWorking: T;
  /** Whether the editor is dirty after this external update */
  nextIsDirty: boolean;
  /** Whether an external conflict notice should be shown */
  nextExternalNotice: boolean;
  /** True if a clean editor adopted the new baseline and should sync secondary surfaces (e.g. iframe) */
  shouldAdopt: boolean;
}

export function computeExternalSettingsSync<T>(params: {
  currentSaved: T | null;
  currentWorking: T;
  isDirty: boolean;
  incomingSaved: T | null;
  publishedDefault: T;
}): ExternalSyncResult<T> {
  const { currentSaved, currentWorking, isDirty, incomingSaved, publishedDefault } = params;
  const hasSavedChanged = JSON.stringify(incomingSaved) !== JSON.stringify(currentSaved);

  if (!hasSavedChanged) {
    return {
      hasSavedChanged: false,
      nextSaved: currentSaved,
      nextWorking: currentWorking,
      nextIsDirty: isDirty,
      nextExternalNotice: false,
      shouldAdopt: false,
    };
  }

  const baseline = incomingSaved ?? publishedDefault;
  const matchesNewBaseline = JSON.stringify(currentWorking) === JSON.stringify(baseline);

  if (!isDirty) {
    // Clean editor: adopt new baseline
    return {
      hasSavedChanged: true,
      nextSaved: incomingSaved,
      nextWorking: baseline,
      nextIsDirty: false,
      nextExternalNotice: false,
      shouldAdopt: true,
    };
  }

  // Dirty editor:
  if (matchesNewBaseline) {
    // Real external update made working value equal to the new baseline -> becomes clean
    return {
      hasSavedChanged: true,
      nextSaved: incomingSaved,
      nextWorking: currentWorking,
      nextIsDirty: false,
      nextExternalNotice: false,
      shouldAdopt: false,
    };
  }

  // Dirty editor with conflicting external update: retain working edits, stay dirty, show notice
  return {
    hasSavedChanged: true,
    nextSaved: incomingSaved,
    nextWorking: currentWorking,
    nextIsDirty: true,
    nextExternalNotice: true,
    shouldAdopt: false,
  };
}
