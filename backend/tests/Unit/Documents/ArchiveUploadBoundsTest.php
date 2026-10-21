<?php

declare(strict_types=1);

namespace App\Mvp\Archive {
    // Test-only seam: proves rejected values never reach the decoder.
    function base64_decode(string $value, bool $strict = false): string|false {
        \Tests\Unit\Documents\ArchiveUploadBoundsTest::$decodeCalls++;
        return \base64_decode($value, $strict);
    }
}

namespace Tests\Unit\Documents {
    use App\Mvp\Archive\ArchiveController;
    use Illuminate\Http\Request;
    use Tests\TestCase;
    use Symfony\Component\HttpKernel\Exception\HttpException;

    final class ArchiveUploadBoundsTest extends TestCase {
        public static int $decodeCalls = 0;
        private function process(mixed $files): array {
            $request = Request::create('/', 'POST', ['files' => $files]);
            return (new \ReflectionMethod(ArchiveController::class, 'processUploadedFiles'))->invoke(new ArchiveController(), $request);
        }
        private function reject(mixed $files, int $calls = 0): void {
            self::$decodeCalls = 0;
            try { $this->process($files); self::fail('Expected rejection'); }
            catch (HttpException $e) { self::assertSame(422, $e->getStatusCode()); }
            self::assertSame($calls, self::$decodeCalls);
        }
        private function file(int $bytes): array {
            $png = \base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', true);
            return ['filename' => 'boundary.png', 'dataBase64' => base64_encode(str_pad($png, $bytes, "\0"))];
        }
        public function test_oversize_and_wrong_types_are_rejected_before_decode(): void {
            $this->reject('not-an-array');
            $this->reject([['filename'=>'x.png','dataBase64'=>str_repeat('A', 4 * intdiv(10485760 + 2, 3) + 4)]]);
            // Same encoded length as the 10 MiB boundary, but padding represents one extra raw byte.
            $this->reject([$this->file(10485761)]);
            foreach ([['filename'=>[], 'dataBase64'=>'AAAA'], ['filename'=>'x.png','dataBase64'=>[]], ['filename'=>12,'dataBase64'=>'AAAA'], ['filename'=>'x.png','dataBase64'=>"AA A"]] as $item) $this->reject([$item]);
        }
        public function test_exact_file_and_submission_boundaries_are_accepted(): void {
            self::$decodeCalls = 0;
            $files = $this->process([$this->file(10485760), $this->file(10485760), $this->file(5242880)]);
            self::assertCount(3, $files);
            self::assertSame(26214400, array_sum(array_column($files, 'bytes')));
            self::assertSame(3, self::$decodeCalls);
        }
        public function test_aggregate_overflow_is_rejected_before_decoding_last_file(): void {
            $this->reject([$this->file(10485760), $this->file(10485760), $this->file(5242881)], 2);
        }
    }
}
