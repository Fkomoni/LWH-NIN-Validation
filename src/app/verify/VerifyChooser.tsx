"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioItem } from "@/components/ui/radio";
import { Label } from "@/components/ui/label";
import { PrincipalNinForm } from "./PrincipalNinForm";

type Choice = "retry" | "principal-nin";

export function VerifyChooser({ enrolleeId }: { enrolleeId: string }) {
  const [choice, setChoice] = useState<Choice>("retry");

  return (
    <div className="space-y-6">
      <RadioGroup
        value={choice}
        onValueChange={(v) => setChoice(v as Choice)}
        className="grid gap-3"
      >
        {[
          {
            v: "retry",
            t: "Try my date of birth again",
            d: "Go back and re-enter your Enrollee ID and DOB.",
          },
          {
            v: "principal-nin",
            t: "Validate with my NIN",
            d: "We'll check your NIN with NIMC and match it against the date of birth you entered. If it matches, we'll update our records with your NIN and continue to your dependants.",
          },
        ].map((o) => (
          <label
            key={o.v}
            htmlFor={`v-${o.v}`}
            className="flex cursor-pointer items-start gap-3 rounded-md border p-4 hover:bg-accent"
          >
            <RadioItem id={`v-${o.v}`} value={o.v} className="mt-1" />
            <div>
              <Label htmlFor={`v-${o.v}`} className="cursor-pointer text-base">
                {o.t}
              </Label>
              <p className="text-sm text-muted-foreground">{o.d}</p>
            </div>
          </label>
        ))}
      </RadioGroup>

      {choice === "retry" ? (
        <div className="flex justify-end">
          <Button asChild size="lg">
            <Link href="/auth">Back to start</Link>
          </Button>
        </div>
      ) : null}

      {choice === "principal-nin" ? (
        <PrincipalNinForm enrolleeId={enrolleeId} />
      ) : null}
    </div>
  );
}
