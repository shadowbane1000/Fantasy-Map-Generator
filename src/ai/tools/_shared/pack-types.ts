/**
 * Minimal, permissive shapes for the `window.pack` collections that
 * AI tools interact with. Fields are optional because:
 *   (a) the live pack is mutated by legacy JS that may not fill every
 *       field for every entry,
 *   (b) tools only touch the fields they need and benefit from
 *       forgiving shapes.
 *
 * If a new tool needs a field that isn't listed here, add it rather
 * than redeclaring a local interface.
 */

export interface RawState {
  i: number;
  name?: string;
  fullName?: string;
  form?: string;
  formName?: string;
  type?: string;
  color?: string;
  culture?: number;
  capital?: number;
  center?: number;
  pole?: [number, number] | number[];
  expansionism?: number;
  burgs?: number;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  provinces?: number[];
  neighbors?: number[];
  lock?: boolean;
  removed?: boolean;
}

export interface RawBurg {
  i: number;
  name?: string;
  x?: number;
  y?: number;
  cell?: number;
  state?: number;
  culture?: number;
  capital?: number;
  port?: number;
  type?: string;
  population?: number;
  feature?: number;
  group?: string;
  coa?: unknown;
  lock?: boolean;
  removed?: boolean;
}

export interface RawCulture {
  i: number;
  name?: string;
  color?: string;
  type?: string;
  base?: number;
  shield?: string;
  code?: string;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  expansionism?: number;
  lock?: boolean;
  removed?: boolean;
}

export interface RawReligion {
  i: number;
  name?: string;
  type?: string;
  form?: string;
  deity?: string | null;
  color?: string;
  culture?: number;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  expansion?: string;
  expansionism?: number;
  code?: string;
  lock?: boolean;
  removed?: boolean;
}

export interface RawProvince {
  i: number;
  name?: string;
  fullName?: string;
  formName?: string;
  color?: string;
  state?: number;
  burg?: number;
  center?: number;
  pole?: [number, number] | number[];
  lock?: boolean;
  removed?: boolean;
}

export interface RawMarker {
  i: number;
  type?: string;
  icon?: string;
  x?: number;
  y?: number;
  cell?: number;
  dx?: number;
  dy?: number;
  px?: number;
  pinned?: boolean;
  lock?: boolean;
  removed?: boolean;
}

export interface RawRiver {
  i: number;
  name?: string;
  type?: string;
  length?: number;
  discharge?: number;
  width?: number;
  sourceWidth?: number;
  source?: number;
  mouth?: number;
  parent?: number;
  basin?: number;
  cells?: number[];
  points?: unknown[];
  removed?: boolean;
}

export interface RawRoute {
  i: number;
  group?: string;
  name?: string;
  length?: number;
  feature?: number;
  points?: unknown[];
  cells?: unknown[];
  merged?: boolean;
  lock?: boolean;
  removed?: boolean;
}

export interface RawNote {
  id: string;
  name?: string;
  legend?: string;
}

export interface Pack {
  states?: RawState[];
  burgs?: RawBurg[];
  cultures?: RawCulture[];
  religions?: RawReligion[];
  provinces?: RawProvince[];
  markers?: RawMarker[];
  rivers?: RawRiver[];
  routes?: RawRoute[];
  cells?: {
    i?: unknown[];
    state?: unknown[];
    burg?: unknown[];
    culture?: unknown[];
    religion?: unknown[];
    province?: unknown[];
    haven?: unknown[];
    f?: unknown[];
    p?: unknown[];
    [key: string]: unknown;
  };
}
