<?php
/** Rendered only for installed_55_23. Keeps every pre-existing row in the digest. */
function batch02PreservationPlan(PDO $pdo): array {
    $plan = ['exclude' => [], 'controls' => [], 'expected' => [],
        'started_at' => (string)$pdo->query('SELECT UTC_TIMESTAMP(6)')->fetchColumn()];
    batch02LoadSnapshotDtos();
    $dates = $pdo->query("SELECT from_date, until_date FROM schedules WHERE id LIKE 'memorial-b01-%' ORDER BY from_date LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $approved = batch02ApprovedRows($dates ?: null);
    $airports = $pdo->query("SELECT code FROM airports WHERE code IN ('OSL','ARN')")->fetchAll(PDO::FETCH_COLUMN);
    $missingAirports = array_values(array_diff(['OSL','ARN'], $airports));
    if ($missingAirports) $plan['exclude']['airports'] = ['code', $missingAirports];
    $expectedSchedules = ['memorial-b01-osl-out','memorial-b01-osl-in','memorial-b01-arn-out','memorial-b01-arn-in'];
    $statement = $pdo->prepare('SELECT id FROM schedules WHERE id IN (?,?,?,?)');
    $statement->execute($expectedSchedules);
    $missingSchedules = array_values(array_diff($expectedSchedules, $statement->fetchAll(PDO::FETCH_COLUMN)));
    if ($missingSchedules) $plan['exclude']['schedules'] = ['id', $missingSchedules];
    // The installed application must already have real active equipment. Never admit fallback fleet inserts.
    foreach (['a321neo'=>'Airbus A321neo','a320neo'=>'Airbus A320neo'] as $id=>$model) {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM aircraft WHERE id=? AND model=? AND active=1');
        $statement->execute([$id,$model]);
        if ((int)$statement->fetchColumn() < 1) throw new RuntimeException('Batch02 requires existing active Nordic fleet; forward repair required.');
    }
    foreach ([['network', 'network', (bool)$missingAirports], ['schedule', 'schedules', (bool)$missingSchedules]] as [$prefix,$domain,$changes]) {
        if (!$changes) continue;
        $control = $prefix . '_revision_control';
        $revisions = $prefix . '_revisions';
        $statement = $pdo->prepare("SELECT revision FROM `$control` WHERE domain=?");
        $statement->execute([$domain]);
        $before = $statement->fetchColumn();
        if ($before === false) throw new RuntimeException('Missing installed reference control; forward repair required.');
        $revision = (int)$before + 1;
        $plan['controls'][$control] = [$domain, (int)$before, $revision];
        $plan['exclude'][$revisions] = ['revision', [$revision]];
        $statement = $pdo->prepare("SELECT COUNT(*) FROM `$revisions` WHERE revision=?");
        $statement->execute([$revision]);
        if ((int)$statement->fetchColumn() !== 0) throw new RuntimeException('Unexpected pre-existing next reference revision.');
    }
    foreach (['airports', 'schedules'] as $table) {
        if (!isset($plan['exclude'][$table])) continue;
        foreach ($plan['exclude'][$table][1] as $id) $plan['expected'][$table][$id] = $approved[$table][$id];
    }
    foreach ($plan['controls'] as $table => [$domain, $before, $revision]) {
        $prefix = $domain === 'network' ? 'network' : 'schedule';
        $snapshot = batch02ExpectedSnapshot($pdo, $domain, $revision, $plan['expected']);
        $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $plan['expected'][$prefix . '_revisions'][$revision] = [
            'domain' => $domain, 'revision' => $revision, 'snapshot_bytes' => $bytes,
            'snapshot_json' => $bytes, 'snapshot_hash' => hash('sha256', $bytes),
        ];
    }
    return $plan;
}

function batch02PreservationQuery(PDO $pdo, string $table, array $columns, array $plan, bool $after): PDOStatement {
    $where = '';
    $parameters = [];
    if (isset($plan['exclude'][$table])) {
        [$column, $values] = $plan['exclude'][$table];
        $where = ' WHERE `' . $column . '` NOT IN (' . implode(',', array_fill(0,count($values),'?')) . ')';
        $parameters = $values;
        if ($after) {
            $check = $pdo->prepare("SELECT * FROM `$table` WHERE `$column` IN (" . implode(',',array_fill(0,count($values),'?')) . ')');
            $check->execute($values);
            $added = $check->fetchAll(PDO::FETCH_ASSOC);
            if (count($added) !== count($values)) throw new RuntimeException('Approved Batch02 additions missing or duplicated.');
            $finishedAt = (string)$pdo->query('SELECT UTC_TIMESTAMP(6)')->fetchColumn();
            foreach ($added as $row) {
                $expected = $plan['expected'][$table][$row[$column]] ?? null;
                if ($expected === null) throw new RuntimeException('Unplanned Batch02 addition.');
                batch02AssertApprovedRow($row, $expected, $table, $plan['started_at'], $finishedAt);
            }
        }
    }
    $statement = $pdo->prepare("SELECT * FROM `$table`$where ORDER BY " . implode(',',$columns));
    $statement->execute($parameters);
    return $statement;
}

function batch02PreservationRow(array $row, string $table, array $plan, bool $after): array {
    if (isset($plan['controls'][$table])) {
        [$domain,$before,$expected] = $plan['controls'][$table];
        if (($row['domain'] ?? null) === $domain) {
            if ((int)$row['revision'] !== ($after ? $expected : $before)) throw new RuntimeException('Unexpected reference control transition.');
            // Normalize only the reviewed +1 field; every other original column remains hashed.
            $row['revision'] = is_string($row['revision']) ? (string)$before : $before;
        }
    }
    return $row;
}


/** DTO files are pure; load only the three hash-verified candidate files, never Laravel bootstrap. */
function batch02LoadSnapshotDtos(): void {
    global $candidatePkgDir;
    if (!is_string($candidatePkgDir ?? null)) throw new RuntimeException('Verified candidate package required for snapshot DTOs.');
    foreach (['Network/AirportDto', 'Network/RouteDto', 'Schedules/ScheduleDto'] as $dto) {
        require_once $candidatePkgDir . '/private/backend/app/Reference/' . $dto . '.php';
    }
}

function batch02ApprovedRows(?array $dates): array {
    $airports = [];
    foreach ([
        ['OSL','Oslo Airport, Gardermoen','???? ?????? ?????????','Oslo','?????','Norway','???????','Europe/Oslo',310],
        ['ARN','Stockholm Arlanda Airport','???? ???????? ???????','Stockholm','????????','Sweden','??????','Europe/Stockholm',290],
    ] as [$code,$name,$nameAr,$city,$cityAr,$country,$countryAr,$tz,$minutes]) {
        $airports[$code] = ['code'=>$code,'airport_name_en'=>$name,'airport_name_ar'=>$nameAr,
            'city_en'=>$city,'city_ar'=>$cityAr,'country_en'=>$country,'country_ar'=>$countryAr,
            'timezone'=>$tz,'block_minutes'=>$minutes,'active'=>1];
    }
    $schedules = [];
    foreach ([
        ['osl-out','PS 241','out','OSL',[1,4],'08:15:00','12:25:00','Airbus A321neo','a321neo'],
        ['osl-in','PS 242','in','OSL',[1,4],'14:00:00','20:10:00','Airbus A321neo','a321neo'],
        ['arn-out','PS 243','out','ARN',[2,5],'08:30:00','12:20:00','Airbus A320neo','a320neo'],
        ['arn-in','PS 244','in','ARN',[2,5],'14:00:00','19:50:00','Airbus A320neo','a320neo'],
    ] as [$suffix,$number,$direction,$destination,$days,$depart,$arrive,$aircraft,$aircraftId]) {
        $id = 'memorial-b01-' . $suffix;
        $schedules[$id] = ['id'=>$id,'number'=>$number,'direction'=>$direction,'destination'=>$destination,
            'days_json'=>json_encode($days),'depart_time'=>$depart,'arrive_time'=>$arrive,
            'aircraft'=>$aircraft,'aircraft_id'=>$aircraftId,'from_date'=>$dates['from_date'] ?? '2026-10-19',
            'until_date'=>$dates['until_date'] ?? '2027-10-19','active'=>1,'exceptions_json'=>'[]'];
    }
    return ['airports'=>$airports,'schedules'=>$schedules];
}

function batch02ExpectedSnapshot(PDO $pdo, string $domain, int $revision, array $additions): array {
    if ($domain === 'network') {
        $airports = $pdo->query('SELECT * FROM airports ORDER BY code')->fetchAll(PDO::FETCH_ASSOC);
        $airports = array_merge($airports, array_values($additions['airports'] ?? []));
        usort($airports, static fn($a,$b) => strcmp($a['code'],$b['code']));
        $routes = $pdo->query('SELECT * FROM routes ORDER BY destination_code, direction')->fetchAll(PDO::FETCH_ASSOC);
        return ['airports'=>array_map(static fn($r)=>\App\Reference\Network\AirportDto::fromRow((object)$r)->toArray(), $airports),
            'routes'=>array_map(static fn($r)=>\App\Reference\Network\RouteDto::fromRow((object)$r)->toArray(), $routes)];
    }
    $schedules = $pdo->query('SELECT * FROM schedules ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $schedules = array_merge($schedules, array_values($additions['schedules'] ?? []));
    usort($schedules, static fn($a,$b)=>strcmp($a['id'],$b['id']));
    return ['revision'=>$revision,'schedules'=>array_map(static fn($r)=>\App\Reference\Schedules\ScheduleDto::fromRow((object)$r)->toArray(), $schedules)];
}

function batch02CanonicalJson(string $json): string {
    $sort = static function ($value) use (&$sort) {
        if (is_object($value)) {
            $properties = get_object_vars($value); ksort($properties);
            foreach ($properties as &$item) $item = $sort($item);
            return (object)$properties;
        }
        return is_array($value) ? array_map($sort, $value) : $value;
    };
    return json_encode($sort(json_decode($json, false, 512, JSON_THROW_ON_ERROR)), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function batch02Timestamp(string $value): DateTimeImmutable {
    foreach (['!Y-m-d H:i:s.u', '!Y-m-d H:i:s'] as $format) {
        $date = DateTimeImmutable::createFromFormat($format, $value, new DateTimeZone('UTC'));
        if ($date && DateTimeImmutable::getLastErrors() === false
            && $date->format(str_contains($format,'.u') ? 'Y-m-d H:i:s.u' : 'Y-m-d H:i:s') === $value) return $date;
    }
    throw new RuntimeException('Invalid Batch02 timestamp.');
}

function batch02AssertApprovedRow(array $actual, array $expected, string $table, string $start, string $finish): void {
    $timestampKeys = in_array($table,['airports','schedules'],true) ? ['created_at','updated_at'] : ['created_at'];
    $keys = array_keys($actual); sort($keys);
    $approvedKeys = array_merge(array_keys($expected),$timestampKeys); sort($approvedKeys);
    if ($keys !== $approvedKeys) throw new RuntimeException('Unexpected Batch02 row columns.');
    foreach ($expected as $key=>$value) {
        $got = $actual[$key];
        if (in_array($key,['days_json','exceptions_json','snapshot_json'],true)) {
            if (!is_string($got) || batch02CanonicalJson($got) !== batch02CanonicalJson($value)) throw new RuntimeException('Batch02 JSON value mismatch.');
        } elseif (is_int($value)) {
            if (!(is_int($got) || (is_string($got) && preg_match('/^(0|[1-9][0-9]*)$/D',$got))) || (int)$got !== $value) throw new RuntimeException('Batch02 numeric value mismatch.');
        } elseif ($got !== $value) throw new RuntimeException('Batch02 approved value mismatch.');
    }
    $begin = batch02Timestamp($start); $end = batch02Timestamp($finish);
    foreach ($timestampKeys as $key) {
        if (!is_string($actual[$key])) throw new RuntimeException('Invalid Batch02 timestamp type.');
        $when = batch02Timestamp($actual[$key]);
        if ($when < $begin || $when > $end) throw new RuntimeException('Batch02 timestamp outside migration window.');
    }
    if (count($timestampKeys) === 2 && $actual['created_at'] !== $actual['updated_at']) throw new RuntimeException('New Batch02 row was changed after creation.');
}
