"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getYear = () => new Date().getFullYear();
const getServerYear = () => null;

/**
 * Current year, read only in the browser. Reading the clock during prerender is
 * disallowed with cacheComponents, so the server snapshot is empty and the year
 * fills in on hydration.
 */
export function CurrentYear() {
  const year = useSyncExternalStore(subscribe, getYear, getServerYear);
  return <span>{year}</span>;
}
