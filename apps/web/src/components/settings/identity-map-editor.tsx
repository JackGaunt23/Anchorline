"use client";

// Producer identity map CRUD: the only join path between RingCentral
// extensions and AgencyZoom producers. Also hosts the manual "ramping" flag
// that drives the Ramping badge.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "../toast";

export interface MappingView {
  id: string;
  displayName: string;
  roleTitle: string;
  rcExtensionId: string | null;
  azProducerId: string | null;
  isRamping: boolean;
  active: boolean;
}

interface FormState {
  displayName: string;
  roleTitle: string;
  rcExtensionId: string;
  azProducerId: string;
  isRamping: boolean;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  displayName: "",
  roleTitle: "Producer",
  rcExtensionId: "",
  azProducerId: "",
  isRamping: false,
  active: true,
};

export function IdentityMapEditor({ mappings }: { mappings: MappingView[] }) {
  // "new" = the add form; a mapping id = editing that row; null = closed.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  function startEdit(m: MappingView) {
    setEditing(m.id);
    setForm({
      displayName: m.displayName,
      roleTitle: m.roleTitle,
      rcExtensionId: m.rcExtensionId ?? "",
      azProducerId: m.azProducerId ?? "",
      isRamping: m.isRamping,
      active: m.active,
    });
  }

  async function save() {
    setSaving(true);
    try {
      const isNew = editing === "new";
      const res = await fetch("/api/settings/identity-map", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? {} : { id: editing }),
          displayName: form.displayName,
          roleTitle: form.roleTitle,
          rcExtensionId: form.rcExtensionId,
          azProducerId: form.azProducerId,
          isRamping: form.isRamping,
          active: form.active,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save mapping");
      showToast(isNew ? "Mapping added" : "Mapping updated", form.displayName);
      setEditing(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      showToast("Save failed", err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Producer</th>
              <th>Role</th>
              <th>RC extension</th>
              <th>AZ producer ID</th>
              <th>Ramping</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                <td className="!font-sans font-semibold">{m.displayName}</td>
                <td className="!font-sans !text-left text-ink-secondary">{m.roleTitle}</td>
                <td>{m.rcExtensionId ?? "—"}</td>
                <td>{m.azProducerId ?? "—"}</td>
                <td>{m.isRamping ? "Yes" : "—"}</td>
                <td>{m.active ? "Yes" : "No"}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    className="cursor-pointer text-xs font-semibold text-teal underline underline-offset-2"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {mappings.length === 0 && (
              <tr>
                <td colSpan={7} className="!text-center text-ink-muted">
                  No producer mappings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <form
          className="flex flex-col gap-3 rounded-md border border-hairline bg-sunken p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="text-[12.5px] font-bold">{editing === "new" ? "Add producer mapping" : "Edit mapping"}</div>
          <div className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-2">
            <Field label="Display name" required value={form.displayName} onChange={(v) => setForm((f) => ({ ...f, displayName: v }))} />
            <Field label="Role title" value={form.roleTitle} onChange={(v) => setForm((f) => ({ ...f, roleTitle: v }))} />
            <Field
              label="RingCentral extension"
              value={form.rcExtensionId}
              onChange={(v) => setForm((f) => ({ ...f, rcExtensionId: v }))}
              placeholder="e.g. 101 (blank = not mapped)"
            />
            <Field
              label="AgencyZoom producer ID"
              value={form.azProducerId}
              onChange={(v) => setForm((f) => ({ ...f, azProducerId: v }))}
              placeholder="e.g. 9001 (blank = not mapped)"
            />
          </div>
          <div className="flex items-center gap-5">
            <Checkbox label="Ramping (drives the Ramping badge)" checked={form.isRamping} onChange={(v) => setForm((f) => ({ ...f, isRamping: v }))} />
            <Checkbox label="Active" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || form.displayName.trim() === ""}
              className="cursor-pointer rounded-full bg-teal px-4 py-[7px] text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY_FORM);
              }}
              className="cursor-pointer rounded-full border border-hairline-strong bg-card px-4 py-[7px] text-[12.5px] font-semibold text-ink hover:bg-sunken"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditing("new");
          }}
          className="cursor-pointer self-start rounded-full border border-hairline-strong bg-card px-4 py-[7px] text-[12.5px] font-semibold text-ink hover:bg-sunken"
        >
          + Add mapping
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-ink-secondary">
      {label}
      <input
        type="text"
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-hairline-strong bg-card px-2.5 py-2 text-[13px] font-normal text-ink placeholder:text-ink-muted"
      />
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-secondary">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--teal)]" />
      {label}
    </label>
  );
}
