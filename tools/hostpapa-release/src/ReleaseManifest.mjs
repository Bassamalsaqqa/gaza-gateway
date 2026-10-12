import { normalizeRelativePath } from './SafePath.mjs';
const ROOT = ['schema_version','release_id','source_sha','built_at','is_dirty','classification','platform_requirements','summary','control_files','installer','public_files','private_files'];
export const CONTROL_NAMES = ['SOURCE_COMMIT.txt','RELEASE_ID.txt','STATUS.txt','manifest-public.txt','manifest-private.txt'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
export function validateReleaseManifest(manifest) {
  const errors = [];
  if (!exact(manifest, ROOT)) return {valid:false, errors:['Closed manifest root required']};
  if (manifest.schema_version !== '1.0' || typeof manifest.release_id !== 'string' || !/^[A-Za-z0-9_]{1,128}$/.test(manifest.release_id)
    || typeof manifest.source_sha !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.source_sha)
    || typeof manifest.is_dirty !== 'boolean' || !['ENGINEERING_TEST_BUILD','UNREVIEWED_RELEASE_CANDIDATE'].includes(manifest.classification)) errors.push('Invalid manifest identity/classification');
  if (!exact(manifest.platform_requirements, ['php','laravel','locked_production_packages_count']) || !exact(manifest.summary,['public_file_count','public_bytes','private_file_count','private_bytes','control_file_count'])) errors.push('Invalid manifest platform/summary');
  for (const key of ['public_files','private_files','installer','control_files']) {
    const map = manifest[key];
    if (!object(map) || Object.keys(map).length === 0) { errors.push('Nonempty closed file map required: '+key); continue; }
    for (const [name, entry] of Object.entries(map)) {
      try { normalizeRelativePath(name); if (name.includes(':')) throw new Error(); }
      catch { errors.push('Unsafe manifest file path'); }
      if (!exact(entry,['size','sha256']) || !Number.isSafeInteger(entry?.size) || entry.size < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) errors.push('Invalid file checksum/size');
    }
  }
  if (!exact(manifest.control_files, CONTROL_NAMES) || !exact(manifest.installer,['installer/hostpapa-install.php'])) errors.push('Invalid installer/control inventory');
  return {valid: errors.length === 0, errors};
}
