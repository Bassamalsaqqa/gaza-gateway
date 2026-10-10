<?php

declare(strict_types=1);

namespace Tests\Feature\IdentityPersistence;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Fixtures\IdentityPersistence\PersistenceTestFactory;
use Tests\TestCase;

class DomainDependencyConstraintsTest extends TestCase
{
    public function test_fare_products_validates_multiplier_and_cabins(): void
    {
        // Multiplier <= 0 rejected
        $this->expectException(QueryException::class);
        PersistenceTestFactory::createFareProduct(['multiplier' => 0.00]);
    }

    public function test_quotes_enforces_usd_and_seat_count_calculation(): void
    {
        // Currency != USD rejected
        try {
            PersistenceTestFactory::createQuote(['currency' => 'EUR']);
            $this->fail('Expected quote with currency != USD to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_quotes_currency', $e->getMessage());
        }

        // seat_count != pax_count - infant_count rejected
        try {
            PersistenceTestFactory::createQuote([
                'pax_count' => 2,
                'infant_count' => 1,
                'seat_count' => 2, // Should be 1!
            ]);
            $this->fail('Expected inconsistent seat_count to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_quotes_seat_count', $e->getMessage());
        }
    }

    public function test_capacity_holds_validates_seat_count_and_composite_session_binding(): void
    {
        $session1 = PersistenceTestFactory::createPassengerSession();
        $session2 = PersistenceTestFactory::createPassengerSession();
        $quoteId = PersistenceTestFactory::createQuote(['checkout_session_id' => $session1]);

        // Cross-session mismatch: hold references quote with session1, but hold declares session2
        try {
            PersistenceTestFactory::createCapacityHold([
                'quote_id' => $quoteId,
                'checkout_session_id' => $session2,
            ]);
            $this->fail('Expected composite FK mismatch on capacity_holds to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_capacity_holds_quote_session', $e->getMessage());
        }

        // Seat count 0 rejected
        try {
            PersistenceTestFactory::createCapacityHold([
                'quote_id' => $quoteId,
                'checkout_session_id' => $session1,
                'seat_count' => 0,
            ]);
            $this->fail('Expected seat_count 0 to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_capacity_holds_seat_count', $e->getMessage());
        }
    }

    public function test_bookings_enforces_hold_uniqueness_and_security_epoch(): void
    {
        $session = PersistenceTestFactory::createPassengerSession();
        $fare = PersistenceTestFactory::createFareProduct();
        $quote = PersistenceTestFactory::createQuote(['checkout_session_id' => $session, 'fare_id' => $fare]);
        $hold = PersistenceTestFactory::createCapacityHold(['quote_id' => $quote, 'checkout_session_id' => $session]);

        // First booking succeeds
        PersistenceTestFactory::createBooking([
            'hold_id' => $hold,
            'quote_id' => $quote,
            'checkout_session_id' => $session,
            'fare_id' => $fare,
            'pnr' => 'GZA-7K8P',
        ]);

        // Duplicate hold conversion rejected by UNIQUE hold_id
        try {
            PersistenceTestFactory::createBooking([
                'hold_id' => $hold,
                'quote_id' => $quote,
                'checkout_session_id' => $session,
                'fare_id' => $fare,
                'pnr' => 'GZA-9M2X',
            ]);
            $this->fail('Expected duplicate hold_id to be rejected');
        } catch (QueryException $e) {
            $this->assertTrue(
                str_contains($e->getMessage(), 'bookings_hold_id_key') ||
                str_contains($e->getMessage(), 'uq_bookings_id_hold') ||
                str_contains($e->getMessage(), 'duplicate key value')
            );
        }

        // Security epoch < 1 rejected
        try {
            $hold2 = PersistenceTestFactory::createCapacityHold(['quote_id' => $quote, 'checkout_session_id' => $session]);
            PersistenceTestFactory::createBooking([
                'hold_id' => $hold2,
                'quote_id' => $quote,
                'checkout_session_id' => $session,
                'fare_id' => $fare,
                'security_epoch' => 0,
            ]);
            $this->fail('Expected security_epoch < 1 to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_bookings_security_epoch', $e->getMessage());
        }
    }

    public function test_booking_passengers_infant_linkage_and_partial_uniqueness(): void
    {
        $booking = PersistenceTestFactory::createBooking();

        $adult1 = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'adult',
            'passenger_index' => 0,
        ]);

        // Infant without linked adult rejected
        try {
            PersistenceTestFactory::createBookingPassenger([
                'booking_id' => $booking,
                'type' => 'infant',
                'linked_adult_passenger_id' => null,
                'passenger_index' => 1,
            ]);
            $this->fail('Expected infant without linked adult to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_passengers_infant_link', $e->getMessage());
        }

        // Adult with linked adult rejected
        try {
            PersistenceTestFactory::createBookingPassenger([
                'booking_id' => $booking,
                'type' => 'adult',
                'linked_adult_passenger_id' => $adult1,
                'passenger_index' => 1,
            ]);
            $this->fail('Expected adult with linked adult to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('chk_booking_passengers_infant_link', $e->getMessage());
        }

        // Cross-booking linked adult rejected
        $otherBooking = PersistenceTestFactory::createBooking();
        try {
            PersistenceTestFactory::createBookingPassenger([
                'booking_id' => $otherBooking,
                'type' => 'infant',
                'linked_adult_passenger_id' => $adult1, // from different booking!
                'passenger_index' => 0,
            ]);
            $this->fail('Expected cross-booking linked adult to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('fk_booking_passengers_linked_adult', $e->getMessage());
        }

        // Valid infant linking adult1 succeeds
        $infant1 = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'infant',
            'linked_adult_passenger_id' => $adult1,
            'passenger_index' => 1,
        ]);
        $this->assertNotEmpty($infant1);

        // At most one infant per adult: second infant linking adult1 rejected by partial unique index
        try {
            PersistenceTestFactory::createBookingPassenger([
                'booking_id' => $booking,
                'type' => 'infant',
                'linked_adult_passenger_id' => $adult1,
                'passenger_index' => 2,
            ]);
            $this->fail('Expected second infant linking same adult to be rejected');
        } catch (QueryException $e) {
            $this->assertStringContainsString('uq_booking_passengers_infant_adult', $e->getMessage());
        }
    }

    public function test_booking_passengers_deferred_adult_target_validation(): void
    {
        $booking = PersistenceTestFactory::createBooking();

        $child = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'child',
            'passenger_index' => 0,
        ]);

        // Infant linking a child is rejected by constraint trigger
        try {
            DB::transaction(function () use ($booking, $child) {
                PersistenceTestFactory::createBookingPassenger([
                    'booking_id' => $booking,
                    'type' => 'infant',
                    'linked_adult_passenger_id' => $child,
                    'passenger_index' => 1,
                ]);
            });
            $this->fail('Expected infant linking child to be rejected by trigger');
        } catch (\Throwable $e) {
            $this->assertStringContainsString('Infant passenger must link to an adult passenger', $e->getMessage());
        }

        // Test mutating adult type when infant is linked
        $adult = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'adult',
            'passenger_index' => 1,
        ]);

        $infant = PersistenceTestFactory::createBookingPassenger([
            'booking_id' => $booking,
            'type' => 'infant',
            'linked_adult_passenger_id' => $adult,
            'passenger_index' => 2,
        ]);

        // Changing adult to child while infant links to it must fail
        try {
            DB::statement("UPDATE booking_passengers SET type = 'child' WHERE id = ?", [$adult]);
            $this->fail('Expected type change of linked adult to fail');
        } catch (QueryException $e) {
            $this->assertStringContainsString('Cannot modify or delete adult passenger linked by an infant', $e->getMessage());
        }

        // Deleting adult while infant links to it must fail
        try {
            DB::statement("DELETE FROM booking_passengers WHERE id = ?", [$adult]);
            $this->fail('Expected deletion of linked adult to fail');
        } catch (QueryException $e) {
            $this->assertTrue(
                str_contains($e->getMessage(), 'Cannot modify or delete adult passenger linked by an infant') ||
                str_contains($e->getMessage(), 'violates foreign key constraint')
            );
        }
    }
}
