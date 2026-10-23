/** Tiny cross-screen signal: compose / manage screens mark the feed dirty; the feed refetches on focus.
 *  `version` lets detail screens notice changes made elsewhere (e.g. after an edit) and refetch on refocus. */
let dirty = false;
let version = 0;
export const socialFeedSignal = {
  markDirty() {
    dirty = true;
    version += 1;
  },
  consume(): boolean {
    const d = dirty;
    dirty = false;
    return d;
  },
  get version() {
    return version;
  },
};
