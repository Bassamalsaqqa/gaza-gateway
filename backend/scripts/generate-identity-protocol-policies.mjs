import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const policiesJsonPath = path.join(rootDir, 'docs/backend/operation-policies.v1.json');
const targetPhpPath = path.join(rootDir, 'backend/app/Identity/Protocol/IdentityOperationPolicies.php');

if (!fs.existsSync(policiesJsonPath)) {
  console.error(`FATAL: Operation policies not found at ${policiesJsonPath}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(policiesJsonPath, 'utf8'));
const allOperations = raw.operations ? Object.values(raw.operations) : [];

const authStaffOps = allOperations
  .filter(op => op.path && (op.path.startsWith('/auth') || op.path.startsWith('/staff')))
  .sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.method.localeCompare(b.method);
  });

if (authStaffOps.length !== 41) {
  console.error(`FATAL: Expected exactly 41 auth/staff operations, found ${authStaffOps.length}`);
  process.exit(1);
}

const sourceDigest = crypto.createHash('sha256').update(JSON.stringify(authStaffOps)).digest('hex');

function toPhpValue(val, indent = '            ') {
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    const innerIndent = indent + '    ';
    const items = val.map(v => `${innerIndent}${toPhpValue(v, innerIndent)}`).join(',\n');
    return `[\n${items},\n${indent}]`;
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val);
    if (keys.length === 0) return '[]';
    const innerIndent = indent + '    ';
    const entries = keys.map(k => `${innerIndent}'${k.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' => ${toPhpValue(val[k], innerIndent)}`).join(',\n');
    return `[\n${entries},\n${indent}]`;
  }
  return 'null';
}

function generatePhp(operations) {
  const lines = [];
  lines.push('<?php');
  lines.push('');
  lines.push('declare(strict_types=1);');
  lines.push('');
  lines.push('namespace App\\Identity\\Protocol;');
  lines.push('');
  lines.push('/**');
  lines.push(' * Closed, server-owned identity operation policies deterministically generated');
  lines.push(' * from docs/backend/operation-policies.v1.json.');
  lines.push(' *');
  lines.push(` * Total operations: ${operations.length}`);
  lines.push(` * Source SHA-256 Digest: ${sourceDigest}`);
  lines.push(' */');
  lines.push('final class IdentityOperationPolicies');
  lines.push('{');
  lines.push(`    public const SOURCE_DIGEST = '${sourceDigest}';`);
  lines.push('');
  lines.push('    /**');
  lines.push('     * Map of "METHOD:PATH" => OperationPolicy metadata.');
  lines.push('     *');
  lines.push('     * @var array<string, array<string, mixed>>');
  lines.push('     */');
  lines.push('    public const OPERATIONS = [');

  for (const op of operations) {
    const key = `${op.method}:${op.path}`;
    const proto = op.protocol || {};
    const realm = proto.realm ?? (op.path.startsWith('/auth') ? 'passenger' : 'staff');
    const branch = proto.branch ?? 'cookie';
    const requiresOrigin = Boolean(proto.requiresOrigin);
    const requiresCsrf = Boolean(proto.requiresCsrf);
    const csrfHeader = proto.csrfHeader ?? (requiresCsrf ? 'X-CSRF-TOKEN' : null);
    const cacheControl = proto.cacheControl ?? 'no-store';
    const requiredPermission = op.requiredPermission ?? null;
    const requiresRecentStepUp = Boolean(op.requiresRecentStepUp);
    const allowedSecurity = op.allowedSecurity ?? [];
    const branchConditions = op.branchConditions ?? [];

    lines.push(`        '${key}' => [`);
    lines.push(`            'operationId' => '${op.operationId}',`);
    lines.push(`            'method' => '${op.method}',`);
    lines.push(`            'path' => '${op.path}',`);
    lines.push(`            'intent' => '${op.intent}',`);
    lines.push(`            'realm' => '${realm}',`);
    lines.push(`            'branch' => '${branch}',`);
    lines.push(`            'requiresOrigin' => ${requiresOrigin ? 'true' : 'false'},`);
    lines.push(`            'requiresCsrf' => ${requiresCsrf ? 'true' : 'false'},`);
    lines.push(`            'csrfHeader' => ${csrfHeader ? `'${csrfHeader}'` : 'null'},`);
    lines.push(`            'cacheControl' => '${cacheControl}',`);
    lines.push(`            'requiredPermission' => ${requiredPermission ? `'${requiredPermission}'` : 'null'},`);
    lines.push(`            'requiresRecentStepUp' => ${requiresRecentStepUp ? 'true' : 'false'},`);
    lines.push(`            'allowedSecurity' => ${toPhpValue(allowedSecurity, '            ')},`);
    lines.push(`            'branchConditions' => ${toPhpValue(branchConditions, '            ')},`);
    lines.push('        ],');
  }

  lines.push('    ];');
  lines.push('');
  lines.push('    /**');
  lines.push('     * Templated operations with path parameters.');
  lines.push('     *');
  lines.push('     * @var array<string, array{pattern: string, paramNames: list<string>, key: string}>');
  lines.push('     */');
  lines.push('    public const TEMPLATES = [');

  const templated = operations.filter(op => op.path.includes('{'));
  for (const op of templated) {
    const key = `${op.method}:${op.path}`;
    // Extract parameter names like {id}
    const paramNames = Array.from(op.path.matchAll(/\{([a-zA-Z0-9_]+)\}/g)).map(m => m[1]);
    let regex = op.path.replace(/\{([a-zA-Z0-9_]+)\}/g, '(?P<$1>[^/]+)');
    regex = `^${regex}$`;
    lines.push(`        '${key}' => [`);
    lines.push(`            'key' => '${key}',`);
    lines.push(`            'method' => '${op.method}',`);
    lines.push(`            'pattern' => '#${regex}#',`);
    lines.push(`            'paramNames' => [${paramNames.map(p => `'${p}'`).join(', ')}],`);
    lines.push('        ],');
  }

  lines.push('    ];');
  lines.push('');
  lines.push('    /**');
  lines.push('     * Find policy by method and path (with or without /api/v1 prefix).');
  lines.push('     * Supports exact literal paths and anchored templated paths with parameter extraction.');
  lines.push('     * Rejects query pollution, double slashes, and extra slash aliases.');
  lines.push('     *');
  lines.push('     * @return array<string, mixed>|null Policy with extracted "params" or null.');
  lines.push('     */');
  lines.push('    public static function find(string $method, string $path): ?array');
  lines.push('    {');
  lines.push('        $normalizedPath = self::normalizePath($path);');
  lines.push('        if ($normalizedPath === null) {');
  lines.push('            return null;');
  lines.push('        }');
  lines.push('');
  lines.push('        $upperMethod = strtoupper(trim($method));');
  lines.push('        $exactKey = $upperMethod . \':\' . $normalizedPath;');
  lines.push('');
  lines.push('        // 1. Exact literal match');
  lines.push('        if (isset(self::OPERATIONS[$exactKey])) {');
  lines.push('            $policy = self::OPERATIONS[$exactKey];');
  lines.push('            $policy[\'params\'] = [];');
  lines.push('            return $policy;');
  lines.push('        }');
  lines.push('');
  lines.push('        // 2. Anchored templated match for the same method');
  lines.push('        foreach (self::TEMPLATES as $tmpl) {');
  lines.push('            if ($tmpl[\'method\'] !== $upperMethod) {');
  lines.push('                continue;');
  lines.push('            }');
  lines.push('');
  lines.push('            if (preg_match($tmpl[\'pattern\'], $normalizedPath, $matches)) {');
  lines.push('                $policy = self::OPERATIONS[$tmpl[\'key\']];');
  lines.push('                $params = [];');
  lines.push('                foreach ($tmpl[\'paramNames\'] as $name) {');
  lines.push('                    if (isset($matches[$name]) && $matches[$name] !== \'\') {');
  lines.push('                        $params[$name] = $matches[$name];');
  lines.push('                    }');
  lines.push('                }');
  lines.push('                $policy[\'params\'] = $params;');
  lines.push('                return $policy;');
  lines.push('            }');
  lines.push('        }');
  lines.push('');
  lines.push('        return null;');
  lines.push('    }');
  lines.push('');
  lines.push('    /**');
  lines.push('     * Find policy by operation ID.');
  lines.push('     */');
  lines.push('    public static function findByOperationId(string $operationId): ?array');
  lines.push('    {');
  lines.push('        foreach (self::OPERATIONS as $policy) {');
  lines.push('            if ($policy[\'operationId\'] === $operationId) {');
  lines.push('                $res = $policy;');
  lines.push('                $res[\'params\'] = [];');
  lines.push('                return $res;');
  lines.push('            }');
  lines.push('        }');
  lines.push('        return null;');
  lines.push('    }');
  lines.push('');
  lines.push('    /**');
  lines.push('     * Normalize path: extract strictly path component without query influence,');
  lines.push('     * strip /api/v1 prefix, ensure leading slash, reject invalid extra slash aliases.');
  lines.push('     */');
  lines.push('    public static function normalizePath(string $path): ?string');
  lines.push('    {');
  lines.push('        // Disallow null bytes');
  lines.push('        if (str_contains($path, chr(0))) {');
  lines.push('            return null;');
  lines.push('        }');
  lines.push('');
  lines.push('        // Extract path component strictly; ignore query string');
  lines.push('        $clean = parse_url($path, PHP_URL_PATH);');
  lines.push('        if ($clean === null || $clean === false || $clean === \'\') {');
  lines.push('            return null;');
  lines.push('        }');
  lines.push('');
  lines.push('        // Reject dot-segments and directory traversal');
  lines.push('        if (str_contains($clean, \'/../\') || str_contains($clean, \'/./\') || str_ends_with($clean, \'/..\') || str_ends_with($clean, \'/.\')) {');
  lines.push('            return null;');
  lines.push('        }');
  lines.push('');
  lines.push('        // Strip /api/v1 or api/v1 prefix once');
  lines.push('        if (str_starts_with($clean, \'/api/v1/\')) {');
  lines.push('            $clean = substr($clean, 7);');
  lines.push('        } elseif ($clean === \'/api/v1\') {');
  lines.push('            $clean = \'/\';');
  lines.push('        } elseif (str_starts_with($clean, \'api/v1/\')) {');
  lines.push('            $clean = \'/\' . substr($clean, 7);');
  lines.push('        } elseif ($clean === \'api/v1\') {');
  lines.push('            $clean = \'/\';');
  lines.push('        }');
  lines.push('');
  lines.push('        // Ensure leading slash');
  lines.push('        if (!str_starts_with($clean, \'/\')) {');
  lines.push('            $clean = \'/\' . $clean;');
  lines.push('        }');
  lines.push('');
  lines.push('        // Reject duplicate consecutive slashes (e.g. /staff//users)');
  lines.push('        if (str_contains($clean, \'//\')) {');
  lines.push('            return null;');
  lines.push('        }');
  lines.push('');
  lines.push('        // Canonicalize identity namespace prefix without decoding subsequent path parameters');
  lines.push('        $segments = explode(\'/\', ltrim($clean, \'/\'));');
  lines.push('        if (!empty($segments)) {');
  lines.push('            $decodedNs = rawurldecode($segments[0]);');
  lines.push('            if ($decodedNs === \'auth\' || $decodedNs === \'staff\') {');
  lines.push('                $segments[0] = $decodedNs;');
  lines.push('                $clean = \'/\' . implode(\'/\', $segments);');
  lines.push('            }');
  lines.push('        }');
  lines.push('');
  lines.push('        return $clean;');
  lines.push('    }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

const isCheck = process.argv.includes('--check');
const generatedCode = generatePhp(authStaffOps);

if (isCheck) {
  if (!fs.existsSync(targetPhpPath)) {
    console.error(`FAIL: ${targetPhpPath} does not exist.`);
    process.exit(1);
  }
  const existing = fs.readFileSync(targetPhpPath, 'utf8');
  if (existing.trim() !== generatedCode.trim()) {
    console.error(`FAIL: ${targetPhpPath} differs from docs/backend/operation-policies.v1.json.`);
    process.exit(1);
  }
  console.log(`OK: ${targetPhpPath} matches docs/backend/operation-policies.v1.json (${authStaffOps.length} operations, digest ${sourceDigest}).`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(targetPhpPath), { recursive: true });
fs.writeFileSync(targetPhpPath, generatedCode, 'utf8');
console.log(`Successfully generated ${targetPhpPath} with ${authStaffOps.length} closed operation policies (digest ${sourceDigest}).`);
