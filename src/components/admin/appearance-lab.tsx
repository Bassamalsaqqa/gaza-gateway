/**
 * Gaza Gateway — Appearance Studio Admin Settings Entrypoint
 *
 * Provides the interactive Appearance Studio workspace under
 * Admin Settings -> Appearance (`/admin/settings?tab=appearance`).
 */

import { AppearanceStudio } from "./appearance-studio";

export { AppearanceStudio };
export const AppearanceLab = AppearanceStudio;
export default AppearanceStudio;
