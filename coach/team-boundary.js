// Phase 3-B: pure, fail-closed team sharing projection. No database or network effects.
export function projectTeamMember(member, consent) {
  if (!member || consent?.shareTeamStatus !== true || consent?.ownerId !== member.ownerId || consent?.teamId !== member.teamId || consent?.guildId !== member.guildId) return null;
  return {
    displayName: typeof member.displayName === 'string' ? member.displayName.slice(0, 80) : '',
    status: ['未着手', '取り組み中', '確認待ち', '完了'].includes(member.status) ? member.status : 'まだ分かりません',
  };
}
export function projectTeamRoster(members, consents) {
  const seen = new Set();
  const result = [];
  for (const member of members ?? []) {
    if (!member || !member.ownerId || seen.has(member.ownerId)) continue;
    const projected = projectTeamMember(member, consents?.find(c => c?.ownerId === member.ownerId));
    if (projected) { seen.add(member.ownerId); result.push(projected); }
  }
  return result;
}
