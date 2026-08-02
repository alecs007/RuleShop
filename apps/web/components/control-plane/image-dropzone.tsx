"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ImagePlus, Star, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "@/components/ui/spinner";

/**
 * Product image upload. The first image in the list is the catalog one, which
 * is why the order can be changed.
 *
 * The real validation happens on the server, against the file's signature.
 * The checks here exist for immediate feedback and nothing relies on them.
 */

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif";
const MAX_IMAGES = 8;

interface Rejected {
  name: string;
  error: string;
}

export function ImageDropzone({
  name,
  initial = [],
}: {
  /** The hidden field carrying the URLs into the form, as JSON. */
  name: string;
  initial?: string[];
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>(initial);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [rejected, setRejected] = useState<Rejected[]>([]);

  const value = useMemo(() => JSON.stringify(urls), [urls]);
  const full = urls.length >= MAX_IMAGES;

  const upload = useCallback(
    async (files: File[]) => {
      const room = MAX_IMAGES - urls.length;
      if (room <= 0) {
        setRejected([{ name: "", error: `Maximum ${MAX_IMAGES} imagini.` }]);
        return;
      }

      const batch = files.slice(0, room);
      const skipped = files.slice(room).map((f) => ({
        name: f.name,
        error: `Peste limita de ${MAX_IMAGES} imagini.`,
      }));

      setRejected(skipped);
      setUploading((n) => n + batch.length);

      const body = new FormData();
      for (const file of batch) body.append("files", file);

      try {
        const response = await fetch("/api/v1/uploads", {
          method: "POST",
          body,
        });
        const result = (await response.json()) as {
          uploaded?: { url: string }[];
          rejected?: Rejected[];
          error?: string;
        };

        if (result.uploaded?.length) {
          setUrls((prev) => [...prev, ...result.uploaded!.map((u) => u.url)]);
        }
        const problems = [
          ...skipped,
          ...(result.rejected ?? []),
          ...(result.error ? [{ name: "", error: result.error }] : []),
        ];
        setRejected(problems);
      } catch {
        setRejected([
          ...skipped,
          { name: "", error: "Încărcarea a eșuat — verifică conexiunea." },
        ]);
      } finally {
        setUploading((n) => Math.max(0, n - batch.length));
      }
    },
    [urls.length],
  );

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const files = [...event.dataTransfer.files].filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) void upload(files);
  };

  /** Removes the image; already-uploaded objects are deleted from the bucket too. */
  const remove = async (url: string) => {
    setUrls((prev) => prev.filter((u) => u !== url));
    if (url.startsWith("/api/v1/media/")) {
      try {
        await fetch(`/api/v1/uploads?key=${encodeURIComponent(url)}`, {
          method: "DELETE",
        });
      } catch {
        // The file is orphaned in the bucket but no longer referenced; not
        // worth blocking the UI over.
      }
    }
  };

  const makePrimary = (url: string) =>
    setUrls((prev) => [url, ...prev.filter((u) => u !== url)]);

  return (
    <div>
      <input type="hidden" name={name} value={value} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-xl border-2 border-dashed p-5 text-center transition-colors",
          dragging
            ? "border-accent bg-blue-50"
            : "border-line bg-surface hover:border-ink-faint",
          full && "opacity-60",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={full}
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length > 0) void upload(files);
            // Reset, so picking the same file fires change again.
            e.target.value = "";
          }}
        />

        <ImagePlus
          className="mx-auto size-7 text-ink-faint"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="mt-2 text-sm">
          <label
            htmlFor={inputId}
            className={cn(
              "font-medium text-accent underline-offset-2 hover:underline",
              full ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            Alege imagini
          </label>{" "}
          <span className="text-ink-muted">sau trage-le aici</span>
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          JPEG, PNG, WebP, AVIF sau GIF · maximum 5 MB fiecare · până la{" "}
          {MAX_IMAGES} imagini
        </p>

        {uploading > 0 && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-ink-muted">
            <Spinner />
            Se încarcă {uploading}{" "}
            {uploading === 1 ? "imagine" : "imagini"}…
          </p>
        )}
      </div>

      {rejected.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rejected.map((problem, i) => (
            <li
              key={`${problem.name}-${i}`}
              className="flex items-start gap-1.5 text-xs text-critical"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
              <span>
                {problem.name && (
                  <span className="font-medium">{problem.name}: </span>
                )}
                {problem.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      {urls.length > 0 && (
        <>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            <AnimatePresence initial={false}>
              {urls.map((url, index) => (
                <motion.li
                  key={url}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-line bg-zinc-100"
                >
                  <Image
                    src={url}
                    alt={index === 0 ? "Imagine principală" : `Imagine ${index + 1}`}
                    fill
                    sizes="200px"
                    className="object-cover"
                  />

                  {index === 0 && (
                    <span className="absolute inset-x-0 bottom-0 bg-ink/70 py-0.5 text-center text-[11px] font-medium text-white">
                      Principală
                    </span>
                  )}

                  <div className="absolute right-1 top-1 flex gap-1">
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => makePrimary(url)}
                        title="Fă imaginea principală"
                        aria-label={`Fă imaginea ${index + 1} principală`}
                        className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-ink-muted transition-colors hover:text-ink"
                      >
                        <Star className="size-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void remove(url)}
                      title="Șterge imaginea"
                      aria-label={`Șterge imaginea ${index + 1}`}
                      className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90 text-ink-muted transition-colors hover:text-critical"
                    >
                      <X className="size-3.5" strokeWidth={1.75} />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
            <Upload className="size-3.5" strokeWidth={1.75} />
            Prima imagine apare în catalog.
          </p>
        </>
      )}
    </div>
  );
}
