// A fast drop-in replacement for makefun-diff 1.0.0: run(input) returns exactly the patch
// makefun-diff 1.0.0 returns for input { old, new }, computed with a leaner engine.
//
// The rule reproduced (from the reference's own header):
// - Lines: a text is cut after every "\n" (the only separator; a "\r" is part of its line),
//   and a last line with no "\n" is a line too. Two lines are equal only as identical code
//   units, the "\n" (or its absence) included. The empty text has no lines.
// - The edit script: the longest common prefix of lines is kept, then the longest common
//   suffix of the lines left; between them, Myers's greedy search from the first lines,
//   which on each diagonal keeps the path reaching furthest into the old text and, when a
//   deletion and an insertion reach the same point, the deletion's; a move past either
//   text's end is no candidate, no edge diagonal is pruned, and every run of lines equal
//   in both is followed as far as it goes. The first path to reach both ends is the script.
// - The patch: a first line "makefun-diff/1 old=N new=M hunks=H deleted=D inserted=I",
//   then each hunk "@ os ol ns nl" and one line per covered line ("=", "-", "+"), each run
//   of changes listing its deletions before its insertions, up to 3 kept lines of context
//   around each run, and runs at most 6 kept lines apart sharing a hunk. A line that ends
//   its text with no newline is written with one and followed by a line "%". Identical
//   texts are the first line alone.
//
// Engine: lines are interned to integer ids (one Map per call), the search keeps one
// Int32Array frontier per depth (the furthest old position reached on each diagonal,
// -2 for unreached) and walks the winning path back with the same decision rule the
// forward pass used, so the script is the reference's own, only cheaper to compute.

const FORMAT = 'makefun-diff/1';
const CONTEXT = 3;

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/**
 * A text's lines and their interned ids. Returns { lines, ids, bare } where lines[i] is
 * the i-th line (with its "\n", except a last line that has none), ids[i] its intern id,
 * and bare says the last line has no "\n". Slicing and interning happen in one pass.
 */
function tokenize(text, intern) {
  const lines = [];
  const len = text.length;
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl === -1) break;
    lines.push(text.slice(start, nl + 1));
    start = nl + 1;
  }
  let bare = false;
  if (start < len) {
    lines.push(text.slice(start));
    bare = true;
  }
  const ids = new Int32Array(lines.length);
  let next = intern.size;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let id = intern.get(line);
    if (id === undefined) {
      id = next++;
      intern.set(line, id);
    }
    ids[i] = id;
  }
  return { lines, ids, bare };
}

/**
 * The edit runs of aIds into bIds (the middle left after the common prefix and suffix are
 * trimmed): [{ kind, count }] with kind KEEP/DELETE/INSERT, in order. The reference's
 * greedy Myers search, replayed from per-depth frontiers.
 */
function editRuns(a, b) {
  const n = a.length;
  const m = b.length;
  const maxD = n + m;
  const hist = new Array(maxD + 1);

  // Depth 0: the initial path at (-1, -1) and the snake along diagonal 0.
  let v0 = new Int32Array(1);
  {
    let x = -1;
    let y = -1;
    while (y + 1 < m && x + 1 < n && a[x + 1] === b[y + 1]) {
      x++;
      y++;
    }
    v0[0] = x;
    hist[0] = v0;
    if (x + 1 >= n && y + 1 >= m) return x >= 0 ? [{ kind: KEEP, count: x + 1 }] : [];
  }

  let foundD = -1;
  let foundK = 0;
  outer: for (let d = 1; d <= maxD; d++) {
    const prev = hist[d - 1];
    const v = new Int32Array(2 * d + 1);
    hist[d] = v;
    // Diagonal -d: only the insertion from diagonal -d+1 (prev index 0) can reach it.
    {
      const ap = prev[0];
      if (ap !== -2 && ap + d < m) {
        let x = ap;
        let y = x + d;
        while (y + 1 < m && x + 1 < n && a[x + 1] === b[y + 1]) {
          x++;
          y++;
        }
        v[0] = x;
        if (x + 1 >= n && y + 1 >= m) {
          foundD = d;
          foundK = -d;
          break outer;
        }
      } else v[0] = -2;
    }
    for (let k = -d + 2; k <= d - 2; k += 2) {
      const rp = prev[k + d - 2];
      const ap = prev[k + d];
      const canRemove = rp !== -2 && rp + 1 < n;
      const canAdd = ap !== -2 && ap - k < m;
      if (!canRemove && !canAdd) {
        v[k + d] = -2;
        continue;
      }
      const byDeletion = canRemove ? rp + 1 : -2;
      const byInsertion = canAdd ? ap : -2;
      let x = byDeletion >= byInsertion ? rp + 1 : ap;
      let y = x - k;
      while (y + 1 < m && x + 1 < n && a[x + 1] === b[y + 1]) {
        x++;
        y++;
      }
      v[k + d] = x;
      if (x + 1 >= n && y + 1 >= m) {
        foundD = d;
        foundK = k;
        break outer;
      }
    }
    // Diagonal d: only the deletion from diagonal d-1 (prev's last index) can reach it.
    {
      const rp = prev[2 * d - 2];
      if (rp !== -2 && rp + 1 < n) {
        let x = rp + 1;
        let y = x - d;
        while (y + 1 < m && x + 1 < n && a[x + 1] === b[y + 1]) {
          x++;
          y++;
        }
        v[2 * d] = x;
        if (x + 1 >= n && y + 1 >= m) {
          foundD = d;
          foundK = d;
          break outer;
        }
      } else v[2 * d] = -2;
    }
  }
  if (foundD === -1) throw new Error('makefun-diff: the search ended without reaching both ends');

  const rev = [];
  let x = hist[foundD][foundK + foundD];
  let y = x - foundK;
  for (let d = foundD; d >= 1; d--) {
    const k = x - y;
    const prev = hist[d - 1];
    const prevOff = d - 1;
    const rp = k - 1 >= -prevOff && k - 1 <= prevOff ? prev[k - 1 + prevOff] : -2;
    const ap = k + 1 >= -prevOff && k + 1 <= prevOff ? prev[k + 1 + prevOff] : -2;
    const canRemove = rp !== -2 && rp + 1 < n;
    const canAdd = ap !== -2 && ap - k < m;
    const byDeletion = canRemove ? rp + 1 : -2;
    const byInsertion = canAdd ? ap : -2;
    let px;
    let kind;
    if (byDeletion >= byInsertion) {
      px = rp + 1;
      kind = DELETE;
    } else {
      px = ap;
      kind = INSERT;
    }
    const snake = x - px;
    if (snake > 0) rev.push(KEEP, snake);
    rev.push(kind, 1);
    if (kind === DELETE) {
      x = px - 1;
      y = x - (k - 1);
    } else {
      x = px;
      y = x - (k + 1);
    }
  }
  if (x >= 0) rev.push(KEEP, x + 1); // the depth-0 snake

  const runs = [];
  for (let i = rev.length - 2; i >= 0; i -= 2) {
    const kind = rev[i];
    const count = rev[i + 1];
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === kind) last.count += count;
    else runs.push({ kind, count });
  }
  return runs;
}

/** A line as the patch writes it: its op, the line, and "%" on its own line when bare. */
function written(op, line, bare) {
  return bare ? `${op}${line}\n%\n` : `${op}${line}`;
}

/** makefun-diff 1.0.0's answer for one case's input { old, new }. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const intern = new Map();
  const A = tokenize(input.old, intern);
  const B = tokenize(input.new, intern);
  const a = A.ids;
  const b = B.ids;
  const n = a.length;
  const m = b.length;

  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  if (prefix + suffix < n || prefix + suffix < m) {
    const mid = editRuns(a.subarray(prefix, n - suffix), b.subarray(prefix, m - suffix));
    for (const r of mid) runs.push(r);
  }
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines,
  // at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h === undefined ? undefined : h[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const aLines = A.lines;
  const bLines = B.lines;
  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', aLines[at], A.bare && at === n - 1));
      for (let i = 0; i < c.dels; i++) out.push(written('-', aLines[c.o + i], A.bare && c.o + i === n - 1));
      for (let i = 0; i < c.ins; i++) out.push(written('+', bLines[c.p + i], B.bare && c.p + i === m - 1));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', aLines[at], A.bare && at === n - 1));
  }
  return out.join('');
}
