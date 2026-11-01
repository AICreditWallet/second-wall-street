"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Flag, MessageSquareReply, Star } from "lucide-react";
import { FormAlert, SubmitButton } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { deleteReview, reportContent, respondToReview, submitReview } from "./actions";

interface Review {
  id: string;
  rating: number;
  body: string;
  createdAt: string;
  edited: boolean;
  author: string;
  mine: boolean;
  hidden: boolean;
  ownerResponse: string | null;
  ownerRespondedAt: string | null;
}
interface Viewer {
  signedIn: boolean;
  canReview: boolean;
  isOwner: boolean;
  myReviewId?: string | null;
}

export function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${value >= i - 0.25 ? "fill-gold text-gold" : value >= i - 0.75 ? "fill-gold/50 text-gold" : "text-fg-subtle"}`} aria-hidden="true" />
      ))}
    </span>
  );
}

function RatingInput({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Your rating</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer" title={`${i} star${i > 1 ? "s" : ""}`}>
            <input type="radio" name="rating" value={i} className="peer sr-only" checked={value === i} onChange={() => setValue(i)} />
            <Star className={`size-7 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-cyan ${value >= i ? "fill-gold text-gold" : "text-fg-subtle hover:text-gold"}`} aria-hidden="true" />
            <span className="sr-only">{i} stars</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ReviewForm({ target, path, existing, onDone }: { target: string; path: string; existing?: Review; onDone: () => void }) {
  const [state, action] = useActionState(submitReview, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-ink-900 p-5">
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="path" value={path} />
      {existing && <input type="hidden" name="reviewId" value={existing.id} />}
      <RatingInput initial={existing?.rating} />
      {state?.errors?.rating && <p className="text-xs text-danger">{state.errors.rating}</p>}
      <div>
        <label htmlFor="review-body" className="mb-1.5 block text-sm font-medium">
          Your review
        </label>
        <textarea
          id="review-body"
          name="body"
          defaultValue={existing?.body}
          maxLength={2000}
          rows={4}
          className="block w-full rounded-xl border border-line bg-ink-950 px-3.5 py-2.5 text-sm text-fg focus:border-cyan/60 focus:outline-none"
          placeholder="What did it do well? What could be better?"
        />
        {state?.errors?.body && <p className="mt-1.5 text-xs text-danger">{state.errors.body}</p>}
      </div>
      <FormAlert state={state} />
      <SubmitButton pending="Publishing…">{existing ? "Update review" : "Publish review"}</SubmitButton>
      <p className="text-xs text-fg-subtle">Reviews are public with your display name. One review per person; you can edit or delete it later.</p>
    </form>
  );
}

function SmallAction({ action, fields, label, pending }: { action: typeof deleteReview; fields: Record<string, string>; label: string; pending: string }) {
  const [state, run] = useActionState(action, null);
  return (
    <form action={run} className="inline">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant="secondary" pending={pending} className="min-h-8 px-3 text-xs">
        {label}
      </SubmitButton>
      {state?.message && <span className="ml-2 text-xs text-fg-muted">{state.message}</span>}
    </form>
  );
}

function RespondForm({ review, path, onDone }: { review: Review; path: string; onDone: () => void }) {
  const [state, action] = useActionState(respondToReview, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="reviewId" value={review.id} />
      <input type="hidden" name="path" value={path} />
      <textarea name="response" defaultValue={review.ownerResponse ?? ""} maxLength={1000} rows={2} aria-label="Your response" className="block w-full rounded-xl border border-line bg-ink-950 px-3 py-2 text-sm" placeholder="Respond publicly as the owner" />
      <FormAlert state={state} />
      <SubmitButton variant="secondary" pending="Posting…" className="min-h-8 px-3 text-xs">
        {review.ownerResponse ? "Update response" : "Post response"}
      </SubmitButton>
    </form>
  );
}

function ReportForm({ targetType, targetId }: { targetType: string; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(reportContent, null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg">
        <Flag className="size-3.5" aria-hidden="true" /> Report
      </button>
    );
  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input name="reason" maxLength={1000} aria-label="Why are you reporting this?" placeholder="Why are you reporting this?" className="block w-full rounded-xl border border-line bg-ink-950 px-3 py-2 text-sm" />
      {state?.errors?.reason && <p className="text-xs text-danger">{state.errors.reason}</p>}
      <FormAlert state={state} />
      {!state?.ok && (
        <SubmitButton variant="secondary" pending="Sending…" className="min-h-8 px-3 text-xs">
          Send report
        </SubmitButton>
      )}
    </form>
  );
}

export function ReviewSection({ target, path, average, count }: { target: string; path: string; average?: number; count?: number }) {
  const [data, setData] = useState<{ reviews: Review[]; viewer: Viewer; unavailable?: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/reviews?target=${encodeURIComponent(target)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => {});
  }, [target]);
  useEffect(load, [load]);
  const done = useCallback(() => {
    setEditing(false);
    setResponding(null);
    load();
  }, [load]);

  const mine = data?.reviews.find((r) => r.mine);
  return (
    <section aria-labelledby="reviews-h" className="mt-12 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="reviews-h" className="text-lg font-semibold">
            Ratings & reviews
          </h2>
          {count ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
              <Stars value={average ?? 0} /> {average?.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="mt-1 text-sm text-fg-muted">No reviews yet.</p>
          )}
        </div>
        {data && !data.viewer.signedIn && (
          <Link href={`/sign-in?next=${encodeURIComponent(path)}`} className={buttonClass("secondary", "min-h-10")}>
            Sign in to review
          </Link>
        )}
      </div>

      {data?.viewer.canReview && <div className="mt-5"><ReviewForm target={target} path={path} onDone={done} /></div>}
      {data?.viewer.signedIn && data.viewer.isOwner && <p className="mt-3 text-xs text-fg-subtle">You can respond to reviews, but not review your own organisation.</p>}

      <ul className="mt-6 space-y-4">
        {data?.reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-line bg-ink-900 p-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Stars value={r.rating} />
              <span className="font-medium">{r.author}</span>
              <span className="text-fg-subtle">
                {new Date(r.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                {r.edited ? " · edited" : ""}
              </span>
              {r.hidden && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger">Hidden by moderators</span>}
            </div>
            {r.mine && editing ? (
              <div className="mt-3">
                <ReviewForm target={target} path={path} existing={r} onDone={done} />
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg-muted">{r.body}</p>
            )}
            {r.ownerResponse && (
              <div className="mt-3 rounded-xl border-l-2 border-cyan/50 bg-white/[0.03] px-3 py-2 text-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-cyan-soft">
                  <MessageSquareReply className="size-3.5" aria-hidden="true" /> Response from the owner
                </p>
                <p className="mt-1 whitespace-pre-line text-fg-muted">{r.ownerResponse}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {r.mine && !editing && (
                <>
                  <button type="button" onClick={() => setEditing(true)} className={buttonClass("secondary", "min-h-8 px-3 text-xs")}>
                    Edit
                  </button>
                  <SmallAction action={deleteReview} fields={{ reviewId: r.id, path }} label="Delete" pending="Deleting…" />
                </>
              )}
              {data.viewer.isOwner &&
                (responding === r.id ? (
                  <RespondForm review={r} path={path} onDone={done} />
                ) : (
                  <button type="button" onClick={() => setResponding(r.id)} className={buttonClass("secondary", "min-h-8 px-3 text-xs")}>
                    {r.ownerResponse ? "Edit response" : "Respond"}
                  </button>
                ))}
              {data.viewer.signedIn && !r.mine && <ReportForm targetType="review" targetId={r.id} />}
            </div>
          </li>
        ))}
      </ul>
      {mine && !editing && <p className="sr-only">You have reviewed this.</p>}
    </section>
  );
}

export function HealthBadge({ health }: { health?: { ok: boolean; checkedAt: string; latencyMs: number | null } }) {
  if (!health) return <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs text-fg-subtle">Not monitored yet</span>;
  // Absolute UTC time: identical on server and client, unlike "x hours ago".
  const when = new Date(health.checkedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${health.ok ? "border-cyan/30 bg-cyan/10 text-cyan-soft" : "border-danger/30 bg-danger/10 text-danger"}`}>
      <span className={`size-1.5 rounded-full ${health.ok ? "bg-cyan" : "bg-danger"}`} aria-hidden="true" />
      {health.ok ? "Healthy" : "Health check failing"} · checked {when} UTC
    </span>
  );
}
