import {isEscalationRanking} from './escalation-rank-command.ts';
import {SKIRMISH_BUTTON,decideSkirmish,withoutSkirmishButtons} from './skirmish.ts';
import {PREDICTION_BUTTON,PREDICTION_MODAL,predictionModal,predictionAmount,openPrediction,buyPrediction} from './valo-predictions.ts';
import {activityLaunchComponents} from './activity-link.ts';
import {MUSIC_BUTTON,runMusic,musicControls} from './music-command.ts';
import {CHOOSE_BUTTON,RECRUIT_BUTTON,DUEL_BUTTON,GAME_IDS,gameCenterCard,gameDetailCard,duelInviteCard,recruitCard,type GameId} from './game-center.ts';
import {startDiscordDuel,respondDiscordDuel} from './game-duel.ts';
import {createRecruit,changeRecruit,linkRecruitMessage} from './game-recruit.ts';
import {isKpRanking} from './kp-command.ts';
import { MBET_BUTTON, betChoices, betFallbackChoices, mbetChoices, mbetDecide, runKpCommand, withinDeadline } from './kp-slash.ts';
// Leaves time for the request to reach Discord inside its three seconds.
const AUTOCOMPLETE_DEADLINE_MS = 2200;
import { PAIFU_BUTTON, decidePaifu, paifuRequest, runPaifuCommand } from './mahjong-claims.ts';
import type { PaifuReply } from './mahjong-claims.ts';
import { runValoCommand } from './valo-queries.ts';
import { initializeKp, issueKpCode } from './kp.ts';
import storedConfig from '../discord-config.json' with { type: 'json' };
import configuredPlayers from '../players.json' with { type: 'json' };
import type { Env, Player } from './index.ts';
import type { DeathSession } from './death-sessions.ts';
import { deathActionKey, deathModeKey, deathName, deathQueueName, isDeathMode, sessionModeSQL } from './death-modes.ts';
import { deathRequest } from './death-request.ts';
import { deathModePicker, selectDeathMode } from './death-mode-picker.ts';
import type { ExpectedDeathAction } from './death-modes.ts';

export interface DiscordConfig { applicationId: string; publicKey: string; guildId: string; workerUrl?: string }
interface Option { type: number; name: string; value?: string; options?: Option[] }
export interface Interaction {
  id: string; application_id: string; type: number; token?: string; guild_id?: string;
  member?: { permissions?: string; user?: { id: string } };
  data?: { type?: number; name?: string; options?: Option[]; custom_id?: string; values?: string[]; component_type?: number; components?: unknown[] };
  message?: { id?:string; channel_id?:string; flags?: number; components?: unknown[] };
}
const respond = (content: string) => Response.json({ type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } });
const unhex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], byte => parseInt(byte, 16));
const label = (player: Player) => (player.name || player.riotId.split('#')[0]).replace(/[\r\n`*_~|<>]/g, '').slice(0, 80);

export async function runDeathCommand(db: D1Database, interaction: Interaction, players: Player[] = configuredPlayers, expectedActions?: ExpectedDeathAction[]): Promise<string> {
  const request = deathRequest(interaction, players);
  if ('error' in request) return request.error;
  const { action, targets } = request, mode = request.mode ?? 'unrated';
  if (expectedActions && (action !== 'start' || expectedActions.length !== targets.length
    || targets.some((player, n) => player.riotId !== expectedActions[n].riotId))) return '対象者の登録が変わっています。/death start からやり直してください。';
  const now = Date.now();
  const receipt = await db.prepare('INSERT OR IGNORE INTO discord_command_receipts(interaction_id,expires_at) VALUES(?,?)')
    .bind(interaction.id, now + 86400_000).run();
  if (!receipt.meta.changes) {
    return (await db.prepare('SELECT response FROM discord_command_receipts WHERE interaction_id=?')
      .bind(interaction.id).first<{ response: string | null }>())?.response ?? '同じ操作を処理中です。状態は /death status で確認できます。';
  }
  try {
    // The gate and all reservation writes share one transaction. A stop or newer
    // reservation between menu validation and this batch invalidates the old menu.
    const gateKey = 'death_apply:' + interaction.id;
    const gateSQL = expectedActions ? ' AND EXISTS(SELECT 1 FROM monitor_state WHERE key=?)' : '';
    const gateArgs = expectedActions ? [gateKey] : [];
    const gate = expectedActions ? [db.prepare(`INSERT OR IGNORE INTO monitor_state(key,value) SELECT ?,'1' WHERE ${expectedActions
      .map(() => "COALESCE((SELECT value FROM monitor_state WHERE key=?),'')=?").join(' AND ')}`)
      .bind(gateKey, ...expectedActions.flatMap(entry => [deathActionKey(entry.riotId), entry.value ?? '']))] : [];
    const marks = () => targets.map(player => db.prepare(`INSERT INTO monitor_state(key,value) SELECT ?,? WHERE 1=1${gateSQL} ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(deathActionKey(player.riotId), interaction.id, ...gateArgs));
    if (action === 'start') {
      const changes = targets.flatMap(player => [
        db.prepare(`UPDATE death_unrated_sessions AS s SET cancelled_at=? WHERE riot_id=?
          AND match_id IS NULL AND cancelled_at IS NULL AND (expires_at<? OR ${sessionModeSQL}!=?)${gateSQL}`).bind(now, player.riotId, now, mode, ...gateArgs),
        db.prepare(`INSERT OR IGNORE INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at)
          SELECT ?,?,?,? WHERE 1=1${gateSQL}`).bind(player.riotId, interaction.id, now, now + 2 * 3600_000, ...gateArgs),
        db.prepare(`INSERT OR IGNORE INTO monitor_state(key,value) SELECT ?,? WHERE EXISTS(
          SELECT 1 FROM death_unrated_sessions WHERE riot_id=? AND session_id=?)${gateSQL}`)
          .bind(deathModeKey(interaction.id, player.riotId), mode, player.riotId, interaction.id, ...gateArgs),
      ]);
      const applied = await db.batch([...gate, ...changes, ...marks(), ...(expectedActions ? [db.prepare('DELETE FROM monitor_state WHERE key=?').bind(gateKey)] : [])]);
      if (expectedActions && !applied[0].meta.changes) {
        const changed = '予約状態が変わっています。/death start からやり直してください。';
        await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(changed, interaction.id).run();
        return changed;
      }
    } else if (action === 'stop') {
      await db.batch([...targets.map(player => db.prepare('UPDATE death_unrated_sessions SET cancelled_at=? WHERE riot_id=? AND cancelled_at IS NULL')
        .bind(now, player.riotId)), ...marks()]);
    }
    const lines = await Promise.all(targets.map(async player => {
      const session = await db.prepare(`SELECT s.*,${sessionModeSQL} AS mode FROM death_unrated_sessions s WHERE riot_id=? ORDER BY armed_at DESC,session_id DESC LIMIT 1`)
        .bind(player.riotId).first<DeathSession>();
      const selected = isDeathMode(session?.mode) ? session.mode : 'unrated';
      const state = !session || session.cancelled_at !== null ? '通常プレイ（予約なし）'
        : session.match_id ? deathName(selected) + '：対象試合は決定済み・次の予約はOFF'
        : session.expires_at < now ? deathName(selected) + '：予約期限切れ'
        : '次の' + deathQueueName(selected) + '1試合だけ対象（' + new Date(session.expires_at + 9 * 3600_000).toISOString().slice(11, 16) + ' JSTまで）';
      return label(player) + '：' + state;
    }));
    const content = (action === 'start' ? '☠️ ' + deathName(mode) + '予約\n予約確定より後に始めて、期限内に終了する選択モードの次の1試合だけ判定します。同じモードの待機予約は維持し、別モードの待機予約は切り替えます。'
      : action === 'stop' ? '🕊️ デス予約を取り消しました。今後の未送信・追記も停止します。' : '📋 デス予約の状態')
      + '\n\n' + lines.join('\n');
    await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(content, interaction.id).run();
    console.info('death_command', { action, mode, players: targets.length });
    return content;
  } catch {
    // No credential, interaction token or callback URL is ever printed or stored.
    console.warn('death_command_failed');
    const failure = '操作結果を確認できませんでした。DBの更新が適用済みか確認し、/death status で状態を確認してください。';
    try { await db.prepare('UPDATE discord_command_receipts SET response=? WHERE interaction_id=?').bind(failure, interaction.id).run(); } catch { /* Keep receipt so a replay cannot change a newer reservation. */ }
    return failure;
  }
}

export async function discordInteractions(request: Request, env: Env, ctx: ExecutionContext, config: DiscordConfig = storedConfig): Promise<Response> {
  if (new URL(request.url).pathname !== '/interactions') return new Response('Not found', { status: 404 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!/^\d+$/.test(config.applicationId) || !/^\d+$/.test(config.guildId) || !/^[0-9a-f]{64}$/i.test(config.publicKey)) {
    return new Response('Discord commands are not configured', { status: 503 });
  }
  const signature = request.headers.get('X-Signature-Ed25519') ?? '';
  const timestamp = request.headers.get('X-Signature-Timestamp') ?? '';
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return new Response('Unauthorized', { status: 401 });
  }
  const body = await request.text();
  if (body.length > 65536) return new Response('Request too large', { status: 413 });
  try {
    const key = await crypto.subtle.importKey('raw', unhex(config.publicKey), { name: 'Ed25519' }, false, ['verify']);
    if (!await crypto.subtle.verify('Ed25519', key, unhex(signature), new TextEncoder().encode(timestamp + body))) return new Response('Unauthorized', { status: 401 });
  } catch { return new Response('Unauthorized', { status: 401 }); }
  let interaction: Interaction;
  try { interaction = JSON.parse(body) as Interaction; } catch { return new Response('Invalid JSON', { status: 400 }); }
  if (interaction.application_id !== config.applicationId) return new Response('Unauthorized', { status: 401 });
  if (interaction.type === 1) return Response.json({ type: 1 });
  // A Primary Entry Point can be invoked from a DM, where Discord omits
  // guild_id. Only command / data type 4 can launch there; other gameplay
  // commands still require the configured guild below.
  // Primary Entry Point with handler=APP_HANDLER (1): launch directly without
  // any channel message, webhook, mention, DB touch or deferred follow-up.
  // IMPORTANT: INTERACTION type 2 / DATA type 4, not autocomplete type 4.
  // Deploy this signed handler BEFORE changing Discord's global command.
  if (interaction.type === 2 && interaction.data?.type === 4) {
    if (interaction.guild_id && interaction.guild_id !== config.guildId)
      return respond('このサーバーでは利用できません。');
    if (!/^\d{15,22}$/.test(interaction.id)
        || typeof interaction.token !== 'string' || !interaction.token.length
        || interaction.token.length > 4096) return new Response('Invalid interaction',{status:400});
    return Response.json({type:12});
  }
  if (interaction.guild_id !== config.guildId) return respond('このサーバーでは利用できません。');
  // Read-only candidate lists return type 8 directly, without deferring or buying anything.
  if (interaction.type === 4) {
    const name=interaction.data?.name;
    // Discord drops an answer after three seconds ("オプション読み込み失敗"); a cold start must still answer in time.
    const choices = await withinDeadline<Array<{ name: string; value: string | number }>>(
      (name==='bet'?betChoices(env,interaction):name==='mbet'?mbetChoices(env,interaction):Promise.resolve([])).catch(() => []),
      AUTOCOMPLETE_DEADLINE_MS, () => name==='bet' ? betFallbackChoices() : []);
    return Response.json({ type: 8, data: { choices } });
  }
  let permissions = 0n;
  try { permissions = BigInt(interaction.member?.permissions ?? '0'); } catch { /* Deny invalid permission fields. */ }
  const deathSelect = interaction.type === 3 && /^death_mode:\d+$/.test(interaction.data?.custom_id ?? '');
  const paifuButton = interaction.type === 3 && PAIFU_BUTTON.test(interaction.data?.custom_id ?? '');
  const skirmishButton=interaction.type===3&&SKIRMISH_BUTTON.test(interaction.data?.custom_id??'');
  if(skirmishButton&&SKIRMISH_BUTTON.exec(interaction.data!.custom_id!)?.[1]!==interaction.member?.user?.id)return respond('本人だけが選べます。');
  const mbetButton = interaction.type === 3 && MBET_BUTTON.test(interaction.data?.custom_id ?? '');
  const vpButton = interaction.type === 3 && PREDICTION_BUTTON.test(interaction.data?.custom_id ?? '');
  const vpModal = interaction.type === 5 && PREDICTION_MODAL.test(interaction.data?.custom_id ?? '');
  const gcChoice=interaction.type===3&&CHOOSE_BUTTON.test(interaction.data?.custom_id??'');
  const gcRecruit=interaction.type===3&&RECRUIT_BUTTON.test(interaction.data?.custom_id??'');
  const gcDuel=interaction.type===3&&DUEL_BUTTON.test(interaction.data?.custom_id??'');
  const musicButton=interaction.type===3&&MUSIC_BUTTON.test(interaction.data?.custom_id??'');
  if (['kpgrant','paifulink','unitelink'].includes(interaction.data?.name ?? '') && !(permissions & (8n | 32n))) return respond('このコマンドには「管理者」または「サーバー管理」権限が必要です。');
  if ((interaction.data?.name === 'death' || deathSelect) && !(permissions & (8n | 32n))) return respond('開始・終了・状態確認には「管理者」または「サーバー管理」権限が必要です。');
  if (!deathSelect && !paifuButton && !mbetButton && !skirmishButton && !vpButton && !vpModal && !gcChoice && !gcRecruit && !gcDuel && !musicButton && (interaction.type !== 2 || !['music','play','duel','recruit','predict','death', 'valo', 'kp', 'spike', 'dm', 'keiba', 'bet', 'paifu', 'mleague', 'mbet', 'mclose', 'kpgrant', 'paifulink', 'unitelink', 'horsename', 'give'].includes(interaction.data?.name ?? ''))) return respond('対応していないコマンドです。');
  if (!/^\d+$/.test(interaction.id) || typeof interaction.token !== 'string' || !interaction.token.length || interaction.token.length > 4096) return new Response('Invalid interaction', { status: 400 });
  if(gcChoice){
    const game=CHOOSE_BUTTON.exec(interaction.data!.custom_id!)![1] as GameId;
    return Response.json({type:4,data:gameDetailCard(game,config.applicationId)});
  }
  if((gcRecruit||gcDuel)&&(!interaction.member?.user?.id||!/^\d{15,22}$/.test(interaction.member.user.id)))
    return respond('Discordのユーザーを確認できない。');
  if(gcRecruit&&(!/^\d{15,22}$/.test(interaction.message?.id??'')||!/^\d{15,22}$/.test(interaction.message?.channel_id??'')))
    return respond('募集投稿を確認できない。');
  if (vpButton) {
    const matched = PREDICTION_BUTTON.exec(interaction.data!.custom_id!)!;
    if (!interaction.member?.user?.id) return respond('Discordのユーザーを確認できません。');
    const openedAt=Number((BigInt(matched[1])>>22n)+1420070400000n);
    if(Date.now()>openedAt+60*60000)return respond('このカードは受付終了しています。');
    return Response.json(predictionModal(matched[1],matched[2] as 'win'|'loss'));
  }
  if (vpModal && (!interaction.member?.user?.id || predictionAmount(interaction.data)===null))
    return respond('KP額は100〜100000の整数を入力してください。');
  // A malformed paipu claim is answered privately before the public deferred reply is opened.
  if (interaction.data?.name === 'paifu' && interaction.type === 2) {
    try { paifuRequest(interaction, Date.now()); } catch (error) { return respond((error as Error).message); }
  }
  // Defer immediately so database work never consumes Discord's three-second acknowledgement window.
  // Refusals for a button press go only to the person who pressed it.
  const whisper = async (content: string) => {
    try {
      await fetch('https://discord.com/api/v10/webhooks/' + config.applicationId + '/' + encodeURIComponent(interaction.token!), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, flags: 64, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10_000),
      });
    } catch { console.warn('discord_command_reply_failed'); }
  };
  ctx.waitUntil((async () => {
    let result: { content?: string; components?: unknown[]; embeds?:unknown[]; flags?: number;
      allowed_mentions?: {parse:[];users?:string[]} }, notice: string | undefined;
    let recruitToLink: string|null=null;
    try {
      if(musicButton||interaction.data?.name==='music'){
        const message=await runMusic(env,interaction);
        result={content:message,components:!message.includes('再生サーバーはまだ接続されていない')
          &&!message.includes('再生中の音楽はない')
          &&/^(🎵|🎶|⏸|▶|⏭|⏹|👋|🔊|🔁)/u.test(message)?musicControls():[]};
      }else if(gcRecruit){
        const matched=RECRUIT_BUTTON.exec(interaction.data!.custom_id!)!;
        const view=await changeRecruit(env,matched[2],config.guildId,interaction.member!.user!.id,
          matched[1]==='join',Date.now(),interaction.message?.id,interaction.message?.channel_id);
        result=recruitCard(view,config.applicationId);
      }else if(gcDuel){
        const matched=DUEL_BUTTON.exec(interaction.data!.custom_id!)!;
        const view=await respondDiscordDuel(env,config.guildId,interaction.member!.user!.id,matched[2],
          matched[1] as 'accept'|'decline',interaction.id);
        result=duelInviteCard(view,config.applicationId);
      }else if(interaction.data?.name==='play'){
        result=gameCenterCard(config.applicationId);
      }else if(interaction.data?.name==='duel'){
        const opts=interaction.data.options??[];
        const opponent=String(opts.find(o=>o.name==='opponent')?.value??'');
        const game=String(opts.find(o=>o.name==='game')?.value??'');
        const stake=Number(opts.find(o=>o.name==='stake')?.value);
        const view=await startDiscordDuel(env,config.guildId,interaction.member!.user!.id,
          opponent,game,stake,interaction.id);
        result={...duelInviteCard(view,config.applicationId),allowed_mentions:{parse:[],users:[opponent]}};
      }else if(interaction.data?.name==='recruit'){
        const opts=interaction.data.options??[];
        const game=String(opts.find(o=>o.name==='game')?.value??'');
        const count=opts.find(o=>o.name==='slots')?.value;
        const slots=count===undefined?5:Number(count);
        const view=await createRecruit(env,interaction.id,config.guildId,interaction.member!.user!.id,game,slots);
        recruitToLink=view.id;
        result=recruitCard(view,config.applicationId);
      }else if(vpModal){
        const matched=PREDICTION_MODAL.exec(interaction.data!.custom_id!)!;
        const at=Number((BigInt(interaction.id)>>22n)+1420070400000n);
        result={content:await buyPrediction(env,matched[1],config.guildId,interaction.member!.user!.id,
          matched[2] as 'win'|'loss',predictionAmount(interaction.data)!,at)};
      } else if(interaction.data?.name==='predict'){
        const options=interaction.data.options??[];
        const riot=options.find(o=>o.name==='player')?.value??'';
        const mode=options.find(o=>o.name==='mode')?.value??'competitive';
        const payload=await openPrediction(env,interaction.id,config.guildId,riot,mode,configuredPlayers);
        result=payload;
      } else if(skirmishButton){
        if(!await initializeKp(env))throw Error('KP unavailable');
        const user=interaction.member!.user!.id,decided=await decideSkirmish(env,config.guildId,user,interaction.data!.custom_id!);
        // On the public あかんbot result only the presser's buttons go; the choice itself is told to them alone
        // (稼ぎch announces it). The private /kp balance reply is replaced as before.
        if(((interaction.message?.flags??0)&64)===0){result={components:withoutSkirmishButtons(interaction.message?.components,user)} as typeof result;notice=decided.content;}
        else result=decided;
      } else if (mbetButton) {
        const decided = await mbetDecide(env, interaction);
        if (!decided) return;
        result = decided;
      } else if (paifuButton) {
        const decided: PaifuReply | null = await decidePaifu(env, interaction);
        if (!decided) return;
        ({ notice, ...result } = decided);
      } else if (interaction.data?.name === 'paifu') result = await runPaifuCommand(env, interaction);
      else if (deathSelect) result = { content: await selectDeathMode(env.DB, interaction, configuredPlayers, runDeathCommand), components: [] };
      else if (interaction.data?.name === 'death' && interaction.data.options?.[0]?.name === 'start'
        && !interaction.data.options[0].options?.some(option => option.name === 'mode')) result = await deathModePicker(env.DB, interaction, configuredPlayers);
      else if (['kp','spike','dm','keiba','bet','mleague','mbet','mclose','kpgrant','paifulink','unitelink','horsename','give'].includes(interaction.data?.name??'')) {const out:{components?:unknown[];embeds?:unknown[]}={};result = {content:await runKpCommand(env,interaction,undefined,out),embeds:out.embeds};result.components=out.components??activityLaunchComponents(config.applicationId);}
      else result = { content: interaction.data!.name === 'valo' ? await runValoCommand(env.DB, interaction) : await runDeathCommand(env.DB, interaction) };
    } catch (error) {
      console.warn('discord_command_failed');
      if (paifuButton || skirmishButton || gcRecruit || gcDuel) {
        // Keep the claim message and its buttons; tell only the presser to retry.
        await whisper('操作結果を確認できませんでした。少し待ってからもう一度押してください。');
        return;
      }
      if(['music','duel','recruit','play','predict'].includes(interaction.data?.name??'')||vpModal){
        const message=error instanceof Error?error.message:'';
        result={content:/[ぁ-んァ-ヶ一-龯]/.test(message)&&message.length<=150&&!/SQL|D1_|token|secret/i.test(message)
          ? message:'予想を処理できませんでした。KP残高・受付状況を確認してください。',components:[]};
      }else result = { content: '操作結果を確認できませんでした。KP・馬券は /kp またはActivity、予約は /death status で確認してください。', components: [] }; }
    if (interaction.data?.name === 'valo' && interaction.data.options?.[0]?.name === 'status') {
      try {
        const mapping = await initializeKp(env), user = interaction.member?.user?.id;
        const code = mapping && user ? await issueKpCode(env, mapping, user) : null;
        if (code && mapping && user) {
          const wallet = await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId, user).first<{ balance: number }>();
          result.content = (result.content??'') + '\n\n🪙 本番口座：' + (wallet?.balance ?? 0) + ' KP\nActivityのタイトルで「口座を接続」を押し、次のコードを貼り付けてください（10分・1回のみ）。\n`' + code + '`';
        }
      } catch { console.warn('kp_login_code_failed'); result.content = (result.content??'') + '\n\nKP口座を確認できませんでした。少し待って /valo status をもう一度実行してください。'; }
    }
    try {
      const response = await fetch('https://discord.com/api/v10/webhooks/' + config.applicationId + '/' + encodeURIComponent(interaction.token!) + '/messages/@original', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result,
          ...((result.flags??0)&32768 ? {content:null,embeds:[],poll:null}:{}),
          allowed_mentions: result.allowed_mentions??{ parse: [] } }), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) console.warn('discord_command_reply_failed', { status: response.status });
      else if(interaction.data?.name==='duel' && result.allowed_mentions?.users?.length===1){
        // Editing the deferred card may not push a mention notification. Send one fresh,
        // narrowly targeted follow-up only after Discord confirms the invite card exists.
        const target=result.allowed_mentions.users[0];
        try{
          const sent=await fetch('https://discord.com/api/v10/webhooks/'+config.applicationId+'/'+encodeURIComponent(interaction.token!),{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
              content:'⚔️ <@'+target+'> 決闘の招待が届いている。上のカードで承諾・辞退を選んでほしい。',
              allowed_mentions:{parse:[],users:[target]},
            }),signal:AbortSignal.timeout(10000),
          });
          if(!sent.ok)console.warn('game_duel_invite_notify_pending');
        }catch{console.warn('game_duel_invite_notify_pending');}
      }
      else if(recruitToLink){
        const posted=await response.json() as {id?:string;channel_id?:string};
        if(posted.id&&posted.channel_id&&await linkRecruitMessage(env.DB,recruitToLink,config.guildId,posted.channel_id,posted.id)){
          try{
            const stub=env.VOICE_GATEWAY?.get(env.VOICE_GATEWAY.idFromName('guild:'+config.guildId));
            if(stub){const seeded=await stub.fetch('https://voice/recruit/register',{method:'POST',
              headers:{'Content-Type':'application/json'},body:JSON.stringify({guild:config.guildId,
                channel:posted.channel_id,message:posted.id})});
              if(!seeded.ok)console.warn('game_reaction_seed_pending');}
          }catch{console.warn('game_reaction_seed_pending');}
        }
      }
    } catch { console.warn('discord_command_reply_failed'); }
    if (notice) await whisper(notice);
  })());
  return Response.json(deathSelect || paifuButton || mbetButton || skirmishButton || gcRecruit || gcDuel ? { type: 6 } : { type: 5, data: { flags: isKpRanking(interaction) || isEscalationRanking(interaction) || interaction.data?.name === 'paifu' || ['play','duel','recruit','predict'].includes(interaction.data?.name??'') ? 0 : 64 } });
}
