<?php

declare(strict_types=1);

namespace App\Reference\Meals;

use App\Reference\Meals\Exceptions\MealDuplicateException;
use App\Reference\Meals\Exceptions\MealNotFoundException;
use App\Reference\Meals\Exceptions\MealValidationException;
use App\Support\DatabaseClock;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class MealCoordinator
{
    public function __construct(private readonly MealValidator $validator) {}

    /**
     * @return array{
     *     revision: int,
     *     meals: list<array{id: string, label: array{en: string, ar: string}, active: bool, order: int}>,
     *     defaultMealId: ?string
     * }
     */
    public function publicSnapshot(): array
    {
        $admin = $this->adminSnapshot();
        $publicMeals = array_values(array_filter($admin['meals'], static fn(array $m): bool => $m['active'] === true));

        return [
            'revision' => $admin['revision'],
            'meals' => $publicMeals,
            'defaultMealId' => $admin['defaultMealId'],
        ];
    }

    /**
     * @return array{
     *     revision: int,
     *     meals: list<array{id: string, label: array{en: string, ar: string}, active: bool, order: int}>,
     *     defaultMealId: ?string
     * }
     */
    public function adminSnapshot(): array
    {
        // One statement binds control and immutable bytes even inside a READ COMMITTED staff transaction.
        $row = DB::table('meal_revision_control AS control')
            ->leftJoin('meal_revisions AS history', function ($join): void {
                $join->on('history.domain', '=', 'control.domain')->on('history.revision', '=', 'control.revision');
            })->where('control.domain', 'meals')->select('control.revision', 'history.snapshot_bytes')->first();
        if ($row === null) { throw new \LogicException('Missing meal reference control.'); }
        if ((int) $row->revision === 0) { return ['revision' => 0, 'meals' => [], 'defaultMealId' => null]; }
        if ($row->snapshot_bytes === null) { throw new \LogicException('Missing meal reference snapshot.'); }
        $snapshot = json_decode($row->snapshot_bytes, true, 512, JSON_THROW_ON_ERROR);
        return ['revision' => (int) $row->revision, 'meals' => $snapshot['meals'], 'defaultMealId' => $snapshot['defaultMealId']];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *     result: array{id: string, label: array{en: string, ar: string}, active: bool, order: int},
     *     changed: bool
     * }
     */
    public function create(array $input, Closure $authorize): array
    {
        $validated = $this->validator->validateCreate($input);
        $id = $validated['id'];

        return $this->mutate('meal.create', $id, $authorize, function (object $control) use ($validated, $id): array {
            if (DB::table('meal_options')->where('id', $id)->exists()) {
                throw new MealDuplicateException(sprintf("Meal option with id '%s' already exists.", $id));
            }

            $order = $validated['order'] ?? (int) (DB::table('meal_options')->max('order_num') ?? -1) + 1;

            DB::table('meal_options')->insert([
                'id' => $id,
                'label_en' => $validated['label']['en'],
                'label_ar' => $validated['label']['ar'],
                'active' => $validated['active'],
                'order_num' => $order,
                'created_at' => DatabaseClock::now(),
                'updated_at' => DatabaseClock::now(),
            ]);

            // First active meal establishes the default meal if default is currently null
            if ($control->default_meal_id === null && $validated['active'] === true) {
                DB::table('meal_revision_control')->where('domain', 'meals')->update([
                    'default_meal_id' => $id,
                ]);
            }

            $meal = [
                'id' => $id,
                'label' => $validated['label'],
                'active' => $validated['active'],
                'order' => $order,
            ];

            return ['result' => $meal, 'changed' => true];
        });
    }

    /**
     * @param array<string, mixed> $input
     * @return array{
     *     result: array{id: string, label: array{en: string, ar: string}, active: bool, order: int},
     *     changed: bool
     * }
     */
    public function patch(string $id, array $input, Closure $authorize): array
    {
        $this->validator->validateId($id);
        $patch = $this->validator->validatePatch($input);

        return $this->mutate('meal.patch', $id, $authorize, function (object $control) use ($id, $patch): array {
            $row = DB::table('meal_options')->where('id', $id)->lockForUpdate()->first();
            if ($row === null) {
                throw new MealNotFoundException(sprintf("Meal option '%s' not found.", $id));
            }

            $before = MealDto::fromRow($row)->toArray();

            // Enforce default meal cannot retire until another active default is selected
            if (array_key_exists('active', $patch) && $patch['active'] === false && $before['active'] === true) {
                if ($control->default_meal_id === $id) {
                    throw new MealValidationException(
                        'Cannot deactivate the current default meal; set another active default meal first.'
                    );
                }
            }

            $newLabel = array_key_exists('label', $patch) ? $patch['label'] : $before['label'];
            $newActive = array_key_exists('active', $patch) ? $patch['active'] : $before['active'];
            $newOrder = array_key_exists('order', $patch) ? $patch['order'] : $before['order'];

            $after = [
                'id' => $id,
                'label' => $newLabel,
                'active' => $newActive,
                'order' => $newOrder,
            ];

            if ($after === $before) {
                return ['result' => $before, 'changed' => false];
            }

            DB::table('meal_options')->where('id', $id)->update([
                'label_en' => $newLabel['en'],
                'label_ar' => $newLabel['ar'],
                'active' => $newActive,
                'order_num' => $newOrder,
                'updated_at' => DatabaseClock::now(),
            ]);

            return ['result' => $after, 'changed' => true];
        });
    }

    /**
     * @param list<string> $ids
     * @return array{
     *     result: array{
     *         revision: int,
     *         meals: list<array{id: string, label: array{en: string, ar: string}, active: bool, order: int}>,
     *         defaultMealId: ?string
     *     },
     *     changed: bool
     * }
     */
    public function reorder(array $ids, Closure $authorize): array
    {
        return $this->mutate('meal.reorder', null, $authorize, function () use ($ids): array {
            $existing = DB::table('meal_options')
                ->lockForUpdate()
                ->orderBy('order_num', 'asc')
                ->orderBy('id', 'asc')
                ->pluck('id')
                ->map(static fn(mixed $v): string => (string) $v)
                ->all();

            // Full permutation invariant
            if (count($ids) !== count($existing)) {
                throw new MealValidationException(sprintf(
                    'Reorder array length (%d) must match current meals count (%d).',
                    count($ids),
                    count($existing)
                ));
            }

            $existingSet = array_flip($existing);
            foreach ($ids as $id) {
                if (!isset($existingSet[$id])) {
                    throw new MealValidationException(sprintf("Unknown meal id '%s' in reorder list.", $id));
                }
            }

            if ($ids === $existing) {
                return ['result' => $this->adminSnapshot(), 'changed' => false];
            }

            foreach ($ids as $index => $id) {
                DB::table('meal_options')->where('id', $id)->update([
                    'order_num' => $index,
                    'updated_at' => DatabaseClock::now(),
                ]);
            }

            return ['result' => $this->adminSnapshot(), 'changed' => true];
        });
    }

    /**
     * @return array{
     *     result: array{
     *         revision: int,
     *         meals: list<array{id: string, label: array{en: string, ar: string}, active: bool, order: int}>,
     *         defaultMealId: ?string
     *     },
     *     changed: bool
     * }
     */
    public function setDefault(string $id, Closure $authorize): array
    {
        $this->validator->validateId($id);

        return $this->mutate('meal.default', $id, $authorize, function (object $control) use ($id): array {
            $row = DB::table('meal_options')->where('id', $id)->lockForUpdate()->first();
            if ($row === null) {
                throw new MealNotFoundException(sprintf("Meal option '%s' not found.", $id));
            }

            if (!$row->active) {
                throw new MealValidationException(sprintf("Cannot set inactive meal '%s' as default meal.", $id));
            }

            if ($control->default_meal_id === $id) {
                return ['result' => $this->adminSnapshot(), 'changed' => false];
            }

            DB::table('meal_revision_control')->where('domain', 'meals')->update([
                'default_meal_id' => $id,
            ]);

            return ['result' => $this->adminSnapshot(), 'changed' => true];
        });
    }

    /**
     * Core transactional mutation coordinator enforcing:
     * 1. Session authorization pre-lock
     * 2. Domain sentinel row locking
     * 3. Session revalidation post-lock (against DB clock and fresh state)
     * 4. Idempotent no-op suppression (no revision bump, no audit row)
     * 5. Revision increment and JSON snapshot hashing
     * 6. Append-only immutable audit event logging
     */
    private function mutate(string $action, ?string $mealId, Closure $authorize, Closure $write): array
    {
        return DB::transaction(function () use ($action, $mealId, $authorize, $write): array {
            // Establish principal/session ownership before waiting for domain lock
            $authorize();

            $control = DB::table('meal_revision_control')->where('domain', 'meals')->lockForUpdate()->first();
            if ($control === null) {
                throw new \LogicException('Missing meal reference control.');
            }

            // Fresh wall clock / persisted authority after waiting; full staff/session revalidation after locks
            $actor = $authorize();

            $receipt = $write($control);
            $changed = (bool) ($receipt['changed'] ?? false);

            if (!$changed) {
                return $receipt;
            }

            $revision = (int) $control->revision + 1;
            if ($revision > 9007199254740991) {
                throw new \OverflowException('Meal reference revision exhausted.');
            }

            $allMeals = DB::table('meal_options')
                ->orderBy('order_num', 'asc')
                ->orderBy('id', 'asc')
                ->get()
                ->map(static fn(object $row): array => MealDto::fromRow($row)->toArray())
                ->all();

            $currentDefault = DB::table('meal_revision_control')->where('domain', 'meals')->value('default_meal_id');
            $currentDefaultId = $currentDefault !== null ? (string) $currentDefault : null;

            $snapshot = [
                'revision' => $revision,
                'meals' => $allMeals,
                'defaultMealId' => $currentDefaultId,
            ];

            $bytes = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            DB::table('meal_revision_control')->where('domain', 'meals')->update(['revision' => $revision]);
            DB::table('meal_revisions')->insert([
                'domain' => 'meals',
                'revision' => $revision,
                'snapshot_json' => $bytes,
                'snapshot_bytes' => $bytes,
                'created_at' => DatabaseClock::now(),
            ]);
            DB::table('meal_audit_events')->insert([
                'id' => (string) Str::uuid(),
                'domain' => 'meals',
                'revision' => $revision,
                'staff_id' => $actor->getStaffId(),
                'action' => $action,
                'outcome' => 'success',
                'meal_id' => $mealId,
                'created_at' => DatabaseClock::now(),
            ]);

            if (isset($receipt['result']['revision'])) {
                $receipt['result']['revision'] = $revision;
                $receipt['result']['meals'] = $allMeals;
                $receipt['result']['defaultMealId'] = $currentDefaultId;
            }

            return $receipt;
        });
    }
}
