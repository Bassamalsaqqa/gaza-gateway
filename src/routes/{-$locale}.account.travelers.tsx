import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { btnClass, EmptyState, Field, Input, Panel } from "@/components/kit";
import { useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

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
  const { travelers, addTraveler, updateTraveler, removeTraveler } = useStore();
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(blank);

  return (
    <div className="space-y-4">
      <Panel>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t("account.addTraveler")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addTraveler(form);
            setForm(blank);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <Field label={t("book.firstName")} htmlFor="tv-first">
            <Input
              id="tv-first"
              value={form.firstName}
              onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
              required
            />
          </Field>
          <Field label={t("book.lastName")} htmlFor="tv-last">
            <Input
              id="tv-last"
              value={form.lastName}
              onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
              required
            />
          </Field>
          <Field label={t("book.dob")} htmlFor="tv-dob">
            <Input
              id="tv-dob"
              type="date"
              value={form.dob}
              onChange={(e) => setForm((prev) => ({ ...prev, dob: e.target.value }))}
            />
          </Field>
          <Field label={t("book.nationality")} htmlFor="tv-nat">
            <Input
              id="tv-nat"
              value={form.nationality}
              onChange={(e) => setForm((prev) => ({ ...prev, nationality: e.target.value }))}
            />
          </Field>
          <Field label={t("book.docNumber")} htmlFor="tv-doc" hint={t("common.optional")}>
            <Input
              id="tv-doc"
              value={form.document}
              onChange={(e) => setForm((prev) => ({ ...prev, document: e.target.value }))}
            />
          </Field>
          <div className="sm:col-span-2">
            <button type="submit" className={btnClass("primary", "md")}>
              <UserPlus aria-hidden="true" className="size-4" />
              {t("account.addTraveler")}
            </button>
          </div>
        </form>
      </Panel>

      {travelers.length === 0 ? (
        <EmptyState title={t("account.noTravelers")} description={t("account.noTravelersSub")} />
      ) : (
        <Panel>
          <ul className="divide-y divide-border">
            {travelers.map((traveler) => (
              <li key={traveler.id} className="py-3">
                {editingId === traveler.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      updateTraveler(traveler.id, edit);
                      setEditingId(null);
                    }}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <Field label={t("book.firstName")} htmlFor={`ed-first-${traveler.id}`}>
                      <Input
                        id={`ed-first-${traveler.id}`}
                        value={edit.firstName}
                        onChange={(e) => setEdit((prev) => ({ ...prev, firstName: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label={t("book.lastName")} htmlFor={`ed-last-${traveler.id}`}>
                      <Input
                        id={`ed-last-${traveler.id}`}
                        value={edit.lastName}
                        onChange={(e) => setEdit((prev) => ({ ...prev, lastName: e.target.value }))}
                        required
                      />
                    </Field>
                    <Field label={t("book.dob")} htmlFor={`ed-dob-${traveler.id}`}>
                      <Input
                        id={`ed-dob-${traveler.id}`}
                        type="date"
                        value={edit.dob}
                        onChange={(e) => setEdit((prev) => ({ ...prev, dob: e.target.value }))}
                      />
                    </Field>
                    <Field label={t("book.nationality")} htmlFor={`ed-nat-${traveler.id}`}>
                      <Input
                        id={`ed-nat-${traveler.id}`}
                        value={edit.nationality}
                        onChange={(e) => setEdit((prev) => ({ ...prev, nationality: e.target.value }))}
                      />
                    </Field>
                    <Field label={t("book.docNumber")} htmlFor={`ed-doc-${traveler.id}`}>
                      <Input
                        id={`ed-doc-${traveler.id}`}
                        value={edit.document}
                        onChange={(e) => setEdit((prev) => ({ ...prev, document: e.target.value }))}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" className={btnClass("primary", "sm")}>
                        {t("common.save")}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className={btnClass("ghost", "sm")}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {traveler.firstName} {traveler.lastName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="numeral">{traveler.dob || "—"}</span> · {traveler.nationality || "—"} ·{" "}
                        <span className="code-id">{traveler.document || "—"}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(traveler.id);
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
                        onClick={() => removeTraveler(traveler.id)}
                        className={btnClass("ghost", "sm")}
                        aria-label={`${t("account.remove")} ${traveler.firstName} ${traveler.lastName}`}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
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
    </div>
  );
}
