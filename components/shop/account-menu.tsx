"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CircleUserRound, LogOut, Package, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";

interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function AccountMenu({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink transition-colors hover:bg-zinc-100"
      >
        <CircleUserRound className="size-5" strokeWidth={1.75} />
        <span className="hidden md:inline">Autentificare</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex size-10 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-zinc-100"
      >
        {user.image ? (
          <Image
            src={user.image}
            alt={user.name ?? "Cont"}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <CircleUserRound className="size-5" strokeWidth={1.75} />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 w-56 rounded-xl border border-line bg-surface-raised p-1.5 shadow-subtle"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-zinc-100"
          >
            <UserRound className="size-4" strokeWidth={1.75} /> Contul meu
          </Link>
          <Link
            href="/account/orders"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-zinc-100"
          >
            <Package className="size-4" strokeWidth={1.75} /> Comenzile mele
          </Link>
          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-zinc-100"
          >
            <LogOut className="size-4" strokeWidth={1.75} /> Deconectare
          </button>
        </div>
      )}
    </div>
  );
}
