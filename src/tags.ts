/**
 * The chips that sit after a handle, and the rule for which of them a profile
 * may wear.
 *
 * Pure and React-free so `profileTags` can be tested, because it carries a
 * security rule and not a cosmetic one: the `tags` column is written by the
 * person the chips describe. It is the only place that decides whether a chip
 * is granted or self-issued, and getting it wrong hands somebody a Supporter
 * badge they didn't pay for.
 */

export type TagKind = 'admin' | 'supporter' | 'peloton' | 'zwift' | 'runner';

export const SELF_TAGS: readonly TagKind[] = ['peloton', 'zwift', 'runner'];

export const TAG_STYLES: Record<TagKind, { label: string; tone: string }> = {
  admin: { label: 'Admin', tone: 'text-admin' },
  supporter: { label: 'Supporter', tone: 'text-supporter' },
  peloton: { label: 'Peloton', tone: 'text-peloton' },
  zwift: { label: 'Zwift', tone: 'text-zwift' },
  runner: { label: 'Runner', tone: 'text-runner' },
};

/** The fields of a profile that decide which chips sit after its handle. */
export type ProfileBadges = { is_admin?: boolean; is_supporter?: boolean; tags?: string[] };

/** The tags a profile wears, in display order: granted first, then flair. */
export function profileTags(p: ProfileBadges | null): TagKind[] {
  if (!p) return [];
  // Narrowed to SELF_TAGS rather than to TAG_STYLES: people write their own
  // `tags`, so matching against every known chip would be one dropped check
  // constraint away from letting somebody render their own Supporter badge.
  const flair = (p.tags ?? []).filter((t): t is TagKind =>
    (SELF_TAGS as readonly string[]).includes(t),
  );
  const granted: TagKind[] = [];
  if (p.is_admin) granted.push('admin');
  if (p.is_supporter) granted.push('supporter');
  return [...granted, ...flair];
}
