import type { CommercialCatalogRepository } from "../commercial/types.ts";
import { LocalCommercialCatalogRepository } from "../commercial/repository.ts";
/**
 * Gaza Gateway — Canonical Booking Draft Repository Implementation
 *
 * Provides the single source of truth and authoritative manager for the booking draft:
 * - Backed by `BookingDraftStorageCoordinator` on `gza.booking.draft.v1`.
 * - Pure structural mutations and criteria resets.
 * - Authoritative operational reconciliation via `reconcile()`.
 * - Stable client submission identity management.
 * - Reactive listener notifications for UI query synchronization.
 */

import type { Flight } from "../data.ts";
import { emptyPaxExtras, passengersFor } from "../booking-draft.ts";
import { reconcileDraft } from "./reconciliation.ts";
import {
  BookingDraftStorageCoordinator,
  type BookingDraftCoordinatorOptions,
} from "./storage.ts";
import type {
  BookingDraftRepository,
  BookingDraftState,
  Draft,
  DraftReconciliationResult,
  SearchCriteria,
} from "./types.ts";

export class LocalBookingDraftRepository implements BookingDraftRepository {
  private readonly commercial: CommercialCatalogRepository;
  private coordinator: BookingDraftStorageCoordinator;

  constructor(
    coordinatorOrOptions?: BookingDraftStorageCoordinator | BookingDraftCoordinatorOptions,
    commercial: CommercialCatalogRepository = new LocalCommercialCatalogRepository(),
  ) {
    this.commercial = commercial;
    if (coordinatorOrOptions instanceof BookingDraftStorageCoordinator) {
      this.coordinator = coordinatorOrOptions;
    } else {
      this.coordinator = new BookingDraftStorageCoordinator(coordinatorOrOptions);
    }
  }

  public getDraft(): Draft {
    return this.coordinator.getDraft();
  }

  public getState(): BookingDraftState {
    return this.coordinator.getState();
  }

  public isReady(): boolean {
    return this.coordinator.isReady();
  }

  public isPersistent(): boolean {
    return this.coordinator.isPersistent();
  }

  public getSubmissionId(): string {
    return this.coordinator.getSubmissionId();
  }

  public refreshSubmissionId(): string {
    return this.coordinator.refreshSubmissionId();
  }

  public async updateDraft(updater: Partial<Draft> | ((prev: Draft) => Draft)): Promise<Draft> {
    return this.coordinator.mutate((currentDraft) => {
      const next = typeof updater === "function" ? updater(currentDraft) : { ...currentDraft, ...updater };
      return { draft: next, status: "active" };
    });
  }

  public handleExternalStorageEvent(event: { key?: string | null; newValue?: string | null }): void {
    this.coordinator.handleStorageEvent(event);
  }

  public async resetDraft(
    criteria: SearchCriteria,
    options?: { meal?: string; email?: string; phone?: string },
  ): Promise<Draft> {
    const catalog = (await this.commercial.get()).catalog;
    return this.coordinator.mutate(() => {
      const passengers = passengersFor(criteria);
      const meal = options?.meal ?? catalog.defaultMealId;
      const resetDraftData: Draft = {
        entry: "results",
        criteria,
        outbound: null,
        inbound: null,
        fareId: "classic",
        passengers,
        seats: {},
        extras: { pax: passengers.map(() => emptyPaxExtras(meal)) },
        contact: {
          email: options?.email ?? "",
          phone: options?.phone ?? "",
        },
      };

      return { draft: resetDraftData, status: "active", refreshSubmissionId: true };
    });
  }

  public async clearDraft(): Promise<void> {
    await this.coordinator.mutate((currentDraft) => {
      return { draft: currentDraft, status: "cleared", refreshSubmissionId: true };
    });
  }

  public async reconcile(
    effectiveOutbound: Flight | null | undefined,
    effectiveInbound: Flight | null | undefined,
    options?: { now?: Date | string | number },
  ): Promise<DraftReconciliationResult> {
    const currentDraft = this.coordinator.getDraft();
    const result = reconcileDraft(
      currentDraft,
      effectiveOutbound,
      effectiveInbound,
      options,
    );

    if (result.changed) {
      await this.coordinator.mutate(() => ({
        draft: result.reconciledDraft,
        status: "active",
      }));
    }

    return result;
  }

  public subscribe(listener: () => void): () => void {
    return this.coordinator.subscribe(listener);
  }

  public destroy(): void {
    this.coordinator.dispose();
  }
}
