<?php

declare(strict_types=1);
namespace HostPapaCanary;

final class GitStageProber
{
    public function __construct(private array $config, private Sanitizer $sanitizer) {}

    public function probe(): array
    {
        // Only allocate an exclusive random child of this private canary package.
        // Never write into a caller-selected existing application directory.
        $base = realpath(dirname(__DIR__));
        $results = ['probe'=>'private_filesystem_copy', 'status'=>'FAIL',
            'git_cpanel_execution'=>'UNVERIFIED', 'cleanup'=>false];
        if ($base === false || preg_match('#/(public_html|www|htdocs)(/|$)#i', str_replace('\\','/',$base))) {
            return $results + ['error'=>'Canary must be installed outside the web root.'];
        }
        $owned = $base.'/stage-'.bin2hex(random_bytes(12));
        if (!mkdir($owned,0700)) return $results;
        $files = [$owned.'/release-manifest.txt', $owned.'/artisan'];
        try {
            foreach ($files as $file) {
                $handle = fopen($file,'x');
                if ($handle === false) throw new \RuntimeException('Exclusive probe allocation failed.');
                try { if (fwrite($handle,'owned canary specimen') !== 21) throw new \RuntimeException('Probe write failed.'); }
                finally { fclose($handle); }
                chmod($file,0600);
            }
            foreach ($files as $file) if (file_get_contents($file) !== 'owned canary specimen') throw new \RuntimeException('Probe read failed.');
            $results['status']='PASS';
            $results['notes']='Private filesystem write/read only; actual cPanel Git copy remains unverified.';
        } catch (\Throwable) {
            $results['error']='Private filesystem probe failed.';
        } finally {
            $clean=true;
            foreach ($files as $file) if (file_exists($file) && !unlink($file)) $clean=false;
            if (!rmdir($owned)) $clean=false;
            $results['cleanup']=$clean;
            if (!$clean) $results['status']='FAIL';
        }
        return $results;
    }
}
