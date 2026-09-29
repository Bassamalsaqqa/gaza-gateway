import { PassengerDobPicker } from "@/components/booking/passenger-dob-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { btnClass, EmptyState, Field, Input, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import {
  usePassengerTravelers,
  useAddTravelerMutation,
  useUpdateTravelerMutation,
  useRemoveTravelerMutation,
} from "@/lib/passenger";

export const Route = createFileRoute("/{-$locale}/account/travelers")({
  head: () => ({
    meta: [
      { title: "Saved travellers — Gaza International Airport (GZA)" },
      { name: "description", content: "Save the people you travel with to fill passenger details faster next time." },
      { property: "og:title", content: "Saved travellers — Gaza International Airport" },
      { property: "og:description", content: "Store frequent travellers for faster booking." },
    ],
  }),
  component: TravelersPage,
});

const blank = { firstName: "", lastName: "", dob: "", nationality: "", document: "" };

function TravelersPage() {
  const { t } = useI18n();
  const { data: travelers = [] } = usePassengerTravelers();
  const addMutation = useAddTravelerMutation();
  const updateMutation = useUpdateTravelerMutation();
  const removeMutation = useRemoveTravelerMutation();

  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(blank);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await addMutation.mutateAsync(form);
      setForm(blank);
    } catch {
      setFormError(t("error.saveFailed"));
    }
  };

  const handleEditSubmit = async (e: React.FormEvent, travelerId: string) => {
    e.preventDefault();
    setEditError(null);
    try {
      await updateMutation.mutateAsync({ id: travelerId, patch: edit });
      setEditingId(null);
    } catch {
      setEditError(t("error.saveFailed"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setDeleteError(null);
    try {
      await removeMutation.mutateAsync(deletingId);
      setDeletingId(null);
    } catch {
      setDeleteError(t("error.saveFailed"));
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.addTraveler")}</h2>
        <form onSubmit={handleAddSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t("book.firstName")} htmlFor="tv-first">
            <Input
              id="tv-first"
              value={form.firstName}
              onChange={(e) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, firstName: e.target.value }));
              }}
              required
            />
          </Field>
          <Field label={t("book.lastName")} htmlFor="tv-last">
            <Input
              id="tv-last"
              value={form.lastName}
              onChange={(e) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, lastName: e.target.value }));
              }}
              required
            />
          </Field>
          <Field label={t("book.dob")} htmlFor="tv-dob">
            <PassengerDobPicker
              id="tv-dob"
              value={form.dob}
              onChange={(dob) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, dob }));
              }}
            />
          </Field>
          <Field label={t("book.nationality")} htmlFor="tv-nat">
            <Input
              id="tv-nat"
              value={form.nationality}
              onChange={(e) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, nationality: e.target.value }));
              }}
            />
          </Field>
          <Field label={t("book.docNumber")} htmlFor="tv-doc" hint={t("common.optional")}>
            <Input
              id="tv-doc"
              value={form.document}
              onChange={(e) => {
                setFormError(null);
                setForm((prev) => ({ ...prev, document: e.target.value }));
              }}
            />
          </Field>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={addMutation.isPending}
              className={btnClass("primary", "md")}
            >
              <UserPlus aria-hidden="true" className="size-4" />
              {addMutation.isPending ? t("common.loading") : t("account.addTraveler")}
            </button>
            {formError ? (
              <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
        </form>
      </Panel>

      {deleteError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {deleteError}
        </p>
      ) : null}

      {travelers.length === 0 ? (
        <EmptyState title={t("account.noTravelers")} description={t("account.noTravelersSub")} />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {travelers.map((traveler) => (
              <li key={traveler.id} className="py-3">
                {editingId === traveler.id ? (
                  <form onSubmit={(e) => handleEditSubmit(e, traveler.id)} className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("book.firstName")} htmlFor={`ed-first-${traveler.id}`}>
                      <Input
                        id={`ed-first-${traveler.id}`}
                        value={edit.firstName}
                        onChange={(e) => {
                          setEditError(null);
                          setEdit((prev) => ({ ...prev, firstName: e.target.value }));
                        }}
                        required
                      />
                    </Field>
                    <Field label={t("book.lastName")} htmlFor={`ed-last-${traveler.id}`}>
                      <Input
                        id={`ed-last-${traveler.id}`}
                        value={edit.lastName}
                        onChange={(e) => {
                          setEditError(null);
                          setEdit((prev) => ({ ...prev, lastName: e.target.value }));
                        }}
                        required
                      />
                    </Field>
                    <Field label={t("book.dob")} htmlFor={`ed-dob-${traveler.id}`}>
                      <PassengerDobPicker
                        id={`ed-dob-${traveler.id}`}
                        value={edit.dob}
                        onChange={(dob) => {
                          setEditError(null);
                          setEdit((prev) => ({ ...prev, dob }));
                        }}
                      />
                    </Field>
                    <Field label={t("book.nationality")} htmlFor={`ed-nat-${traveler.id}`}>
                      <Input
                        id={`ed-nat-${traveler.id}`}
                        value={edit.nationality}
                        onChange={(e) => {
                          setEditError(null);
                          setEdit((prev) => ({ ...prev, nationality: e.target.value }));
                        }}
                      />
                    </Field>
                    <Field label={t("book.docNumber")} htmlFor={`ed-doc-${traveler.id}`}>
                      <Input
                        id={`ed-doc-${traveler.id}`}
                        value={edit.document}
                        onChange={(e) => {
                          setEditError(null);
                          setEdit((prev) => ({ ...prev, document: e.target.value }));
                        }}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button
                        type="submit"
                        disabled={updateMutation.isPending}
                        className={btnClass("primary", "sm")}
                      >
                        {updateMutation.isPending ? t("common.loading") : t("common.save")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditError(null);
                        }}
                        className={btnClass("ghost", "sm")}
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                    {editError ? (
                      <p role="alert" className="sm:col-span-2 text-sm font-medium text-destructive">
                        {editError}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {traveler.firstName} {traveler.lastName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span dir="ltr" className="numeral font-mono tabular-nums">{traveler.dob || "—"}</span> · {traveler.nationality || "—"} ·{" "}
                        <span dir="ltr" className="code-id font-mono tabular-nums">{traveler.document || "—"}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(traveler.id);
                          setEditError(null);
                          setEdit({
                            firstName: traveler.firstName,
                            lastName: traveler.lastName,
                            dob: traveler.dob ?? "",
                            nationality: traveler.nationality ?? "",
                            document: traveler.document ?? "",
                          });
                        }}
                        className={btnClass("ghost", "sm")}
                        aria-label={`${t("common.edit")} ${traveler.firstName} ${traveler.lastName}`}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingId(traveler.id);
                        }}
                        className={btnClass("ghost", "sm")}
                        aria-label={`${t("account.remove")} ${traveler.firstName} ${traveler.lastName}`}
                      >
                        <Trash2 aria-hidden="true" className="size-4 text-destructive" />
                        {t("account.remove")}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <ConfirmDialog
        open={deletingId !== null}
        title={t("account.remove")}
        body={t("account.removeConfirm")}
        confirmLabel={t("common.delete")}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
