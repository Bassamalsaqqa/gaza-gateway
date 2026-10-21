<?php
/** Rendered only for installed_55_23. Keeps every pre-existing row in the digest. */
function batch02PreservationPlan(PDO $pdo): array {
    $plan = ['exclude' => [], 'controls' => []];
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
            $check = $pdo->prepare("SELECT COUNT(*) FROM `$table` WHERE `$column` IN (" . implode(',',array_fill(0,count($values),'?')) . ')');
            $check->execute($values);
            if ((int)$check->fetchColumn() !== count($values)) throw new RuntimeException('Approved Batch02 additions missing or duplicated.');
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
