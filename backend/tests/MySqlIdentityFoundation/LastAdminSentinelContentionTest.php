<?php

declare(strict_types=1);

namespace Tests\MySqlIdentityFoundation;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class LastAdminSentinelContentionTest extends MySqlTestCase
{
    public function testStaffDirectoryControlSingletonSeededAndConstrained(): void
    {
        $conn = DB::connection('mysql_test');
        $row = $conn->table('staff_directory_control')->where('id', 1)->first();
        $this->assertNotNull($row, 'staff_directory_control id=1 must be seeded.');

        // Attempting to insert id != 1 must fail CHECK constraint
        $this->expectException(QueryException::class);
        $conn->table('staff_directory_control')->insert([
            'id' => 2,
            'last_mutated_at' => now(),
        ]);
    }

    public function testTwoConnectionSentinelLockContentionAndFreshness(): void
    {
        $conn1 = DB::connection('mysql_test');
        // Purge and create fresh connection 2
        config(['database.connections.mysql_test_proc2' => config('database.connections.mysql_test')]);
        $conn2 = DB::connection('mysql_test_proc2');

        $initialRow = $conn1->table('staff_directory_control')->where('id', 1)->first();
        $this->assertNotNull($initialRow);

        $now1 = now()->subMinutes(5)->format('Y-m-d H:i:s.u');
        $conn1->table('staff_directory_control')->where('id', 1)->update(['last_mutated_at' => $now1]);

        // Connection 1 begins transaction and locks sentinel
        $conn1->beginTransaction();
        $lockedRow = $conn1->selectOne('SELECT * FROM staff_directory_control WHERE id = 1 FOR UPDATE');
        $this->assertNotNull($lockedRow);

        $mutatedTimestamp = now()->format('Y-m-d H:i:s.u');
        $conn1->table('staff_directory_control')->where('id', 1)->update([
            'last_mutated_at' => $mutatedTimestamp,
        ]);

        // Set short lock wait timeout on connection 2 to demonstrate lock contention detection
        $conn2->statement('SET SESSION innodb_lock_wait_timeout = 1');

        $contentionDetected = false;
        try {
            $conn2->selectOne('SELECT * FROM staff_directory_control WHERE id = 1 FOR UPDATE');
        } catch (\Throwable $e) {
            $contentionDetected = true;
            $this->assertStringContainsString('Lock wait timeout exceeded', $e->getMessage());
        }
        $this->assertTrue($contentionDetected, 'Contending transaction must detect exclusive row lock.');

        // Connection 1 commits
        $conn1->commit();

        // After Connection 1 commits, Connection 2 can acquire lock and observe freshness under READ COMMITTED
        $conn2->beginTransaction();
        $freshRow = $conn2->selectOne('SELECT * FROM staff_directory_control WHERE id = 1 FOR UPDATE');
        $conn2->commit();

        $this->assertNotNull($freshRow);
        $this->assertEquals($mutatedTimestamp, $freshRow->last_mutated_at, 'Connection 2 must observe committed mutation under READ COMMITTED.');
    }
}
