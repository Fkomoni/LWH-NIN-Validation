"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { StatusChip } from "@/components/brand/StatusChip";
import type { Household, NinStatus, Person } from "@/types/domain";
import { isValidNinFormat } from "@/lib/validation/nin";
import { submitBeneficiaryNin } from "@/server/actions/nin";

type RowState = {
  nin: string;
  inlineError?: string;
  status: NinStatus;
  message?: string;
  supportRef?: string;
};

function initialRow(p: Person): RowState {
  return { nin: "", status: p.ninStatus };
}

export function HouseholdTable({ household }: { household: Household }) {
  const people = useMemo<Person[]>(
    () => [household.principal, ...household.dependants],
    [household],
  );
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(people.map((p) => [p.id, initialRow(p)])),
  );
  const [pending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const editable = (p: Person) =>
    p.ninStatus !== "VALIDATED" && p.ninStatus !== "UPDATED";

  function setNin(id: string, nin: string) {
    setRows((r) => ({ ...r, [id]: { ...r[id]!, nin, inlineError: undefined } }));
  }

  function duplicateCheck(): boolean {
    const entered = Object.values(rows)
      .map((r) => r.nin.trim())
      .filter((n) => n.length > 0);
    const dup = entered.find((n, i) => entered.indexOf(n) !== i);
    if (dup) {
      setGlobalError(`The same NIN has been entered more than once (ending …${dup.slice(-3)}). Please correct it.`);
      return true;
    }
    setGlobalError(null);
    return false;
  }

  async function submitOne(id: string) {
    const row = rows[id];
    if (!row) return;
    if (!isValidNinFormat(row.nin)) {
      setRows((r) => ({
        ...r,
        [id]: { ...r[id]!, inlineError: "NIN must be exactly 11 digits." },
      }));
      return;
    }
    if (duplicateCheck()) return;

    setRows((r) => ({ ...r, [id]: { ...r[id]!, status: "VALIDATING", message: undefined } }));
    startTransition(async () => {
      try {
        const { result } = await submitBeneficiaryNin({
          beneficiaryId: id,
          nin: row.nin.trim(),
        });
        setRows((r) => ({
          ...r,
          [id]: {
            ...r[id]!,
            status:
              result.outcome === "PASS_AUTO"
                ? "UPDATED"
                : result.outcome === "REVIEW_SOFT"
                  ? "MANUAL_REVIEW"
                  : result.outcome === "TIMEOUT" || result.outcome === "PROVIDER_ERROR"
                    ? "NOT_SUBMITTED" // transient — row stays editable for retry
                    : "FAILED",
            message:
              result.outcome === "PASS_AUTO"
                ? "NIN verified and submitted."
                : result.outcome === "TIMEOUT" || result.outcome === "PROVIDER_ERROR"
                  ? "NIMC is temporarily unavailable. Please try again in a moment."
                  : result.message,
            supportRef: result.supportRef,
          },
        }));
      } catch {
        setRows((r) => ({
          ...r,
          [id]: { ...r[id]!, status: "FAILED", message: "Something went wrong." },
        }));
      }
    });
  }

  async function submitAll() {
    if (duplicateCheck()) return;
    for (const p of people) {
      if (!editable(p)) continue;
      const r = rows[p.id];
      if (!r?.nin) continue;
      // eslint-disable-next-line no-await-in-loop
      await submitOne(p.id);
    }
  }

  const anyDone = Object.values(rows).some(
    (r) => r.status === "VALIDATED" || r.status === "UPDATED" || r.status === "MANUAL_REVIEW" || r.status === "FAILED",
  );

  return (
    <div className="space-y-4">
      {globalError ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {globalError}
        </p>
      ) : null}

      <ul className="space-y-3">
        {people.map((p) => {
          const r = rows[p.id]!;
          return (
            <li key={p.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.relationship.toLowerCase()} · DOB {p.dob}
                  </p>
                </div>
                <StatusChip status={r.status} />
              </div>
              {editable(p) ? (
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <Field
                    id={`nin-${p.id}`}
                    label="NIN"
                    hint="11 digits, numbers only."
                    error={r.inlineError}
                  >
                    <Input
                      name={`nin-${p.id}`}
                      inputMode="numeric"
                      maxLength={11}
                      pattern="\d{11}"
                      value={r.nin}
                      onChange={(e) => setNin(p.id, e.target.value)}
                      placeholder="12345678901"
                      autoComplete="off"
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => submitOne(p.id)}
                  >
                    Validate
                  </Button>
                </div>
              ) : null}
              {r.message ? (
                <p className={`mt-3 text-sm ${
                  r.status === "FAILED" ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {r.message}
                  {r.supportRef ? ` Ref: ${r.supportRef}.` : ""}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Tip: you can submit one at a time, or fill in all of them and click{" "}
          <em>Validate all</em>.
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" disabled={pending} onClick={submitAll}>
            Validate all
          </Button>
          <Button asChild disabled={pending || !anyDone}>
            <Link href="/done">Finish</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
