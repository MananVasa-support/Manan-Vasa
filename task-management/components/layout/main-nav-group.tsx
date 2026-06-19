"use client";

import Link from "next/link";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";

export interface NavGroupItem {
  href: Route;
  label: string;
  Icon: LucideIcon;
  active: boolean;
}

interface Props {
  label: string;
  Icon: LucideIcon;
  items: NavGroupItem[];
  /** True when any child route is active — the trigger then reads as active. */
  active: boolean;
}

/**
 * A grouped nav "pill" that opens a dropdown of related destinations. The
 * trigger reuses the same `.nav-pill` treatment as the flat pills (so it
 * sits visually identical in the header) and flips to `.nav-pill-active`
 * whenever one of its children is the current page. Used on desktop only —
 * the mobile drawer renders these groups as flat labelled sections instead.
 */
export function MainNavGroup({ label, Icon, items, active }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          className={
            "group/navgrp " +
            (active ? "nav-pill nav-pill-active" : "nav-pill")
          }
        >
          <Icon size={16} strokeWidth={2.2} />
          {/* Label collapses to icon-only below xl, matching MainNavPill. */}
          <span className="max-xl:hidden">{label}</span>
          <ChevronDown
            size={14}
            strokeWidth={2.6}
            className="-ml-0.5 opacity-70 transition-transform duration-200 group-data-[state=open]/navgrp:rotate-180"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] min-w-[224px] rounded-xl border border-[#E2E8F0] bg-white p-1.5"
          style={{
            transformOrigin:
              "var(--radix-dropdown-menu-content-transform-origin)",
            animation: "userMenuIn 180ms cubic-bezier(0.16, 1, 0.3, 1)",
            boxShadow:
              "0 24px 48px -16px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.06)",
          }}
        >
          {items.map((it) => (
            <DropdownMenu.Item asChild key={it.href}>
              <Link
                href={it.href}
                aria-current={it.active ? "page" : undefined}
                className={
                  "flex items-center gap-2.5 px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors data-[highlighted]:bg-[#F1F5F9] " +
                  (it.active
                    ? "font-semibold"
                    : "font-medium text-[#0F172A]")
                }
                style={
                  it.active
                    ? {
                        background: "rgba(225, 6, 0, 0.08)",
                        color: "var(--color-altus-red)",
                      }
                    : undefined
                }
              >
                <it.Icon
                  size={15}
                  strokeWidth={2.2}
                  style={{
                    color: it.active ? "var(--color-altus-red)" : "#475569",
                  }}
                />
                <span>{it.label}</span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
