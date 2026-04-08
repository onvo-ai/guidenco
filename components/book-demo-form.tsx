"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  budget: string;
  message: string;
};

const initialState: FormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  budget: "",
  message: "",
};

const budgetOptions = [
  "$0 - $5k / month",
  "$5k - $10k / month",
  "$10k - $25k / month",
  "$25k - $50k / month",
  "$50k+ / month",
];

export function BookDemoForm() {
  const [form, setForm] = React.useState<FormState>(initialState);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/book-demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...form,
          source: "website-book-demo-page",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Something went wrong while submitting your request.");
      }

      setStatus({
        type: "success",
        message: "Thanks — your demo request has been sent and saved to our Notion workspace.",
      });
      setForm(initialState);
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Something went wrong while submitting your request.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-8"
    >
      <div className="mb-6">
        <div className="inline-flex rounded-full border border-[#ff6a00]/20 bg-[#ff6a00]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/70">
          Book a demo
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Tell us a little about your growth goals.
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/60 sm:text-base">
          We’ll store your request in Notion so our team can review it and get back to you quickly.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-white/80">
            Name
          </Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Jane Doe"
            required
            className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="company" className="text-white/80">
            Company
          </Label>
          <Input
            id="company"
            name="company"
            autoComplete="organization"
            value={form.company}
            onChange={(event) => updateField("company", event.target.value)}
            placeholder="Acme Inc."
            required
            className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-white/80">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="jane@company.com"
            required
            className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-white/80">
            Phone number
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="+1 555 123 4567"
            required
            className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="budget" className="text-white/80">
          Marketing budget
        </Label>
        <Select value={form.budget} onValueChange={(value) => updateField("budget", value)}>
          <SelectTrigger
            id="budget"
            className="w-full border-white/10 bg-black/20 text-white data-[placeholder]:text-white/30"
          >
            <SelectValue placeholder="Choose a monthly range" />
          </SelectTrigger>
          <SelectContent>
            {budgetOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-2">
        <Label htmlFor="message" className="text-white/80">
          What do you want to improve?
        </Label>
        <Textarea
          id="message"
          name="message"
          value={form.message}
          onChange={(event) => updateField("message", event.target.value)}
          placeholder="Tell us about your goals, channels, or biggest growth challenge."
          rows={5}
          className="border-white/10 bg-black/20 text-white placeholder:text-white/30"
        />
      </div>

      {status.type !== "idle" ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/20 bg-red-500/10 text-red-200"
          }`}
        >
          <div className="flex items-start gap-2">
            {status.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <div className="mt-0.5 size-4 shrink-0 rounded-full border border-current" />
            )}
            <p>{status.message}</p>
          </div>
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="mt-6 h-12 w-full rounded-full bg-[#ff6a00] text-white hover:bg-[#ff7d26]"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Sending request
          </>
        ) : (
          <>
            <Send className="mr-2 size-4" />
            Request demo
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-xs leading-5 text-white/45">
        By submitting this form, you agree to be contacted about your demo request.
      </p>
    </form>
  );
}
