// Phase 3-B: pure, fail-closed team sharing projection. No database or network effects.
const validId = value => typeof value === 'string' && value.trim().length > 0;
const matchesScope = (member, consent) =>
  ['ownerId', 'teamId', 'guildId'].every(key =>
    validId(member?.[key]) && validId(consent?.[key]) && member[key] === consent[key]);

export function projectTeamMember(member, consent) {
  if (!matchesScope(member, consent) || consent.shareTeamStatus !== true) return null;
  return {
    displayName: typeof member.displayName === 'string' ? member.displayName.slice(0, 80) : '',
    status: ['未着手', '取り組み中', '確認待ち', '完了'].includes(member.status) ? member.status : 'まだ分かりません',
  };
}
export function projectTeamRoster(members, consents) {
  if (!Array.isArray(members) || !Array.isArray(consents)) return [];
  const seen = new Set();
  const result = [];
  for (const member of members) {
    if (!validId(member?.ownerId) || !validId(member?.teamId) || !validId(member?.guildId)) continue;
    const key = JSON.stringify([member.guildId, member.teamId, member.ownerId]);
    if (seen.has(key)) continue;
    const consent = consents.find(c => matchesScope(member, c) && c.shareTeamStatus === true);
    const projected = projectTeamMember(member, consent);
    if (projected) { seen.add(key); result.push(projected); }
  }
  return result;
}
