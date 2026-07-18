import type { D1Database } from "@/lib/types/env";
import type {
  LocalActor, LocalRepo, LocalCommit, LocalTreeEntry, LocalRef,
  LocalFollow, LocalObject, LocalActivity, LocalNotification,
} from "@/lib/types";

type Row = Record<string, unknown>;

function rowToActor(r: Row): LocalActor {
  return {
    id: r.id as string,
    username: r.username as string,
    domain: r.domain as string,
    displayName: (r.display_name as string) ?? null,
    summary: (r.summary as string) ?? null,
    avatarUrl: (r.avatar_url as string) ?? null,
    headerUrl: (r.header_url as string) ?? null,
    publicKeyPem: r.public_key_pem as string,
    privateKeyPem: (r.private_key_pem as string) ?? null,
    isLocal: Boolean(r.is_local),
    followersCount: (r.followers_count as number) ?? 0,
    followingCount: (r.following_count as number) ?? 0,
    reposCount: (r.repos_count as number) ?? 0,
    email: (r.email as string) ?? null,
    passwordHash: (r.password_hash as string) ?? null,
    emailVerified: Boolean(r.email_verified),
    emailVerificationToken: (r.email_verification_token as string) ?? null,
    emailVerificationSentAt: (r.email_verification_sent_at as string) ?? null,
    passwordResetToken: (r.password_reset_token as string) ?? null,
    passwordResetExpiresAt: (r.password_reset_expires_at as string) ?? null,
    inbox: (r.inbox as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToRepo(r: Row): LocalRepo {
  return {
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    actorId: r.actor_id as string,
    isPrivate: (r.is_private as number) ?? 0,
    isExternal: (r.is_external as number) ?? 0,
    externalUrl: (r.external_url as string) ?? null,
    cloneUrl: (r.clone_url as string) ?? null,
    defaultBranch: (r.default_branch as string) ?? 'main',
    objectId: (r.object_id as string) ?? null,
    sizeBytes: (r.size_bytes as number) ?? 0,
    commitCount: (r.commit_count as number) ?? 0,
    starCount: (r.star_count as number) ?? 0,
    forkCount: (r.fork_count as number) ?? 0,
    lastSyncAt: (r.last_sync_at as string) ?? null,
    published: r.published as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToFollow(r: Row): LocalFollow {
  return {
    id: r.id as string,
    actorId: r.actor_id as string,
    targetId: r.target_id as string,
    state: r.state as string,
    activityId: (r.activity_id as string) ?? null,
    createdAt: r.created_at as string,
  };
}

function rowToObject(r: Row): LocalObject {
  return {
    id: r.id as string,
    type: r.type as string,
    actorId: r.actor_id as string,
    content: (r.content as string) ?? null,
    sensitive: Boolean(r.sensitive),
    visibility: r.visibility as string,
    url: (r.url as string) ?? null,
    published: r.published as string,
    updatedAt: r.updated_at as string,
    local: Boolean(r.is_local),
    raw: (r.raw as string) ?? "{}",
  };
}

function rowToNotification(r: Row): LocalNotification {
  return {
    id: r.id as string,
    type: r.type as string,
    accountId: r.account_id as string,
    targetAccountId: r.target_account_id as string,
    objectId: (r.object_id as string) ?? null,
    read: Boolean(r.is_read),
    createdAt: r.created_at as string,
  };
}

// ─── Actors ─────────────────────────────────────────

export async function getActorById(db: D1Database, id: string): Promise<LocalActor | null> {
  const row = await db.prepare("SELECT * FROM actors WHERE id = ?").bind(id).first();
  return row ? rowToActor(row) : null;
}

export async function getActorByUsername(db: D1Database, username: string, domain: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE LOWER(username) = LOWER(?) AND domain = ?")
    .bind(username, domain)
    .first();
  return row ? rowToActor(row) : null;
}

export async function getActorByEmail(db: D1Database, email: string): Promise<LocalActor | null> {
  const row = await db.prepare("SELECT * FROM actors WHERE email = ?").bind(email).first();
  return row ? rowToActor(row) : null;
}

export async function searchActors(db: D1Database, query: string, limit = 20): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT * FROM actors WHERE (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?) ORDER BY is_local DESC, followers_count DESC LIMIT ?")
    .bind(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, limit)
    .all<Row>();
  return results.map(rowToActor);
}

export async function getActorByUsernameAndDomain(db: D1Database, username: string, domain: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE LOWER(username) = LOWER(?) AND LOWER(domain) = LOWER(?)")
    .bind(username, domain)
    .first();
  return row ? rowToActor(row) : null;
}

export async function createActor(db: D1Database, actor: {
  id: string; username: string; domain: string; displayName?: string; summary?: string;
  publicKeyPem: string; privateKeyPem: string; email: string; passwordHash: string;
}): Promise<void> {
  await db
    .prepare("INSERT INTO actors (id, username, domain, display_name, summary, public_key_pem, private_key_pem, email, password_hash, is_local, inbox, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))")
    .bind(actor.id, actor.username, actor.domain, actor.displayName ?? null, actor.summary ?? null,
      actor.publicKeyPem, actor.privateKeyPem, actor.email, actor.passwordHash, `${actor.id}/inbox`)
    .run();
}

export async function updateActor(db: D1Database, id: string, fields: { displayName?: string | null; summary?: string | null; avatarUrl?: string | null }): Promise<void> {
  const { displayName, summary, avatarUrl } = fields;
  await db
    .prepare("UPDATE actors SET display_name = COALESCE(?, display_name), summary = COALESCE(?, summary), avatar_url = COALESCE(?, avatar_url), updated_at = datetime('now') WHERE id = ?")
    .bind(displayName ?? null, summary ?? null, avatarUrl ?? null, id)
    .run();
}

export async function updateActorCounts(db: D1Database, id: string, counts: { followersCount?: number; followingCount?: number; reposCount?: number }): Promise<void> {
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (counts.followersCount !== undefined) { sets.push("followers_count = MAX(0, followers_count + ?)"); vals.push(counts.followersCount); }
  if (counts.followingCount !== undefined) { sets.push("following_count = MAX(0, following_count + ?)"); vals.push(counts.followingCount); }
  if (counts.reposCount !== undefined) { sets.push("repos_count = MAX(0, repos_count + ?)"); vals.push(counts.reposCount); }
  if (sets.length === 0) return;
  vals.push(id);
  await db.prepare(`UPDATE actors SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`).bind(...vals).run();
}

export async function setEmailVerificationToken(db: D1Database, actorId: string, token: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET email_verification_token = ?, email_verification_sent_at = datetime('now') WHERE id = ?")
    .bind(token, actorId).run();
}

export async function verifyEmailByToken(db: D1Database, token: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM actors WHERE email_verification_token = ? AND email_verified = 0")
    .bind(token).first() as { id: string } | null;
  if (!row) return null;
  await db.prepare("UPDATE actors SET email_verified = 1, email_verification_token = NULL, email_verification_sent_at = NULL, updated_at = datetime('now') WHERE id = ?").bind(row.id).run();
  return row.id;
}

export async function setPasswordResetToken(db: D1Database, actorId: string): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare("UPDATE actors SET password_reset_token = ?, password_reset_expires_at = datetime('now', '+1 hour') WHERE id = ?")
    .bind(token, actorId).run();
  return token;
}

export async function getActorByPasswordResetToken(db: D1Database, token: string): Promise<LocalActor | null> {
  const row = await db
    .prepare("SELECT * FROM actors WHERE password_reset_token = ? AND password_reset_expires_at > datetime('now')")
    .bind(token).first();
  return row ? rowToActor(row) : null;
}

export async function updateActorPassword(db: D1Database, actorId: string, passwordHash: string): Promise<void> {
  await db
    .prepare("UPDATE actors SET password_hash = ?, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = datetime('now') WHERE id = ?")
    .bind(passwordHash, actorId).run();
}

// ─── Repos ─────────────────────────────────────────

export async function getReposByActor(db: D1Database, actorId: string): Promise<LocalRepo[]> {
  const { results } = await db
    .prepare("SELECT * FROM repos WHERE actor_id = ? ORDER BY published DESC")
    .bind(actorId).all<Row>();
  return results.map(rowToRepo);
}

export async function getRepoByName(db: D1Database, actorId: string, name: string): Promise<LocalRepo | null> {
  const row = await db
    .prepare("SELECT * FROM repos WHERE actor_id = ? AND LOWER(name) = LOWER(?)")
    .bind(actorId, name).first();
  return row ? rowToRepo(row) : null;
}

export async function getRepoById(db: D1Database, id: string): Promise<LocalRepo | null> {
  const row = await db.prepare("SELECT * FROM repos WHERE id = ?").bind(id).first();
  return row ? rowToRepo(row) : null;
}

export async function createRepo(db: D1Database, repo: {
  id: string; name: string; description?: string; actorId: string;
  isPrivate?: number; isExternal?: number; externalUrl?: string; cloneUrl?: string;
  defaultBranch?: string; objectId?: string; sizeBytes?: number;
}): Promise<void> {
  await db
    .prepare("INSERT INTO repos (id, name, description, actor_id, is_private, is_external, external_url, clone_url, default_branch, object_id, size_bytes, published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))")
    .bind(repo.id, repo.name, repo.description ?? null, repo.actorId,
      repo.isPrivate ?? 0, repo.isExternal ?? 0, repo.externalUrl ?? null, repo.cloneUrl ?? null,
      repo.defaultBranch ?? 'main', repo.objectId ?? null, repo.sizeBytes ?? 0)
    .run();
}

export async function deleteRepo(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM repos WHERE id = ?").bind(id).run();
}

export async function updateRepoSize(db: D1Database, id: string, sizeBytes: number): Promise<void> {
  await db.prepare("UPDATE repos SET size_bytes = ?, updated_at = datetime('now') WHERE id = ?").bind(sizeBytes, id).run();
}

export async function updateRepoLastSync(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE repos SET last_sync_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").bind(id).run();
}

export async function incrementRepoCommits(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE repos SET commit_count = commit_count + 1, updated_at = datetime('now') WHERE id = ?").bind(id).run();
}

export async function searchRepos(db: D1Database, query: string, limit = 20): Promise<LocalRepo[]> {
  const { results } = await db
    .prepare("SELECT r.* FROM repos r JOIN actors a ON a.id = r.actor_id WHERE r.is_private = 0 AND (LOWER(r.name) LIKE ? OR LOWER(r.description) LIKE ? OR LOWER(a.username) LIKE ?) ORDER BY r.star_count DESC, r.updated_at DESC LIMIT ?")
    .bind(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`, limit)
    .all<Row>();
  return results.map(rowToRepo);
}

export async function getReposForSync(db: D1Database): Promise<LocalRepo[]> {
  const { results } = await db
    .prepare("SELECT * FROM repos WHERE is_external = 1 AND external_url IS NOT NULL ORDER BY last_sync_at ASC NULLS FIRST LIMIT 50")
    .all<Row>();
  return results.map(rowToRepo);
}

// ─── Commits ───────────────────────────────────────

export async function createCommit(db: D1Database, commit: {
  id: string; repoId: string; sha: string; treeSha: string; parentSha?: string;
  message: string; authorName: string; authorEmail: string; authoredAt: string;
  committerName: string; committerEmail: string; committedAt: string;
  isLocal?: number; objectId?: string;
}): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO repo_commits (id, repo_id, sha, tree_sha, parent_sha, message, author_name, author_email, authored_at, committer_name, committer_email, committed_at, is_local, object_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(commit.id, commit.repoId, commit.sha, commit.treeSha, commit.parentSha ?? null,
      commit.message, commit.authorName, commit.authorEmail, commit.authoredAt,
      commit.committerName, commit.committerEmail, commit.committedAt,
      commit.isLocal ?? 1, commit.objectId ?? null)
    .run();
}

export async function getCommitsByRepo(db: D1Database, repoId: string, limit = 50, offset = 0): Promise<LocalCommit[]> {
  const { results } = await db
    .prepare("SELECT * FROM repo_commits WHERE repo_id = ? ORDER BY committed_at DESC LIMIT ? OFFSET ?")
    .bind(repoId, limit, offset).all<Row>();
  return results.map((r: Row) => ({
    id: r.id as string, repoId: r.repo_id as string, sha: r.sha as string,
    treeSha: r.tree_sha as string, parentSha: (r.parent_sha as string) ?? null,
    message: r.message as string, authorName: r.author_name as string,
    authorEmail: r.author_email as string, authoredAt: r.authored_at as string,
    committerName: r.committer_name as string, committerEmail: r.committer_email as string,
    committedAt: r.committed_at as string, isLocal: (r.is_local as number) ?? 1,
    objectId: (r.object_id as string) ?? null,
  }));
}

export async function getCommitBySha(db: D1Database, repoId: string, sha: string): Promise<LocalCommit | null> {
  const row = await db
    .prepare("SELECT * FROM repo_commits WHERE repo_id = ? AND sha = ?")
    .bind(repoId, sha).first() as Row | null;
  if (!row) return null;
  return {
    id: row.id as string, repoId: row.repo_id as string, sha: row.sha as string,
    treeSha: row.tree_sha as string, parentSha: (row.parent_sha as string) ?? null,
    message: row.message as string, authorName: row.author_name as string,
    authorEmail: row.author_email as string, authoredAt: row.authored_at as string,
    committerName: row.committer_name as string, committerEmail: row.committer_email as string,
    committedAt: row.committed_at as string, isLocal: (row.is_local as number) ?? 1,
    objectId: (row.object_id as string) ?? null,
  };
}

// ─── Refs ──────────────────────────────────────────

export async function setRef(db: D1Database, ref: { repoId: string; ref: string; targetSha: string; type?: string }): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO repo_refs (id, repo_id, ref, target_sha, type) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), ref.repoId, ref.ref, ref.targetSha, ref.type ?? 'branch')
    .run();
}

export async function getRef(db: D1Database, repoId: string, ref: string): Promise<LocalRef | null> {
  const row = await db
    .prepare("SELECT * FROM repo_refs WHERE repo_id = ? AND ref = ?")
    .bind(repoId, ref).first() as Row | null;
  if (!row) return null;
  return {
    id: row.id as string, repoId: row.repo_id as string,
    ref: row.ref as string, targetSha: row.target_sha as string, type: row.type as string,
  };
}

// ─── Follows ────────────────────────────────────────

export async function getFollow(db: D1Database, actorId: string, targetId: string): Promise<LocalFollow | null> {
  const row = await db.prepare("SELECT * FROM follows WHERE actor_id = ? AND target_id = ?").bind(actorId, targetId).first();
  return row ? rowToFollow(row) : null;
}

export async function getFollowByActivityId(db: D1Database, activityId: string): Promise<LocalFollow | null> {
  const row = await db.prepare("SELECT * FROM follows WHERE activity_id = ?").bind(activityId).first();
  return row ? rowToFollow(row) : null;
}

export async function createFollow(db: D1Database, follow: { id: string; actorId: string; targetId: string; state: string; activityId?: string; createdAt?: string }): Promise<void> {
  await db
    .prepare("INSERT INTO follows (id, actor_id, target_id, state, activity_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(follow.id, follow.actorId, follow.targetId, follow.state, follow.activityId ?? null, follow.createdAt ?? new Date().toISOString())
    .run();
}

export async function updateFollowState(db: D1Database, id: string, state: string): Promise<void> {
  await db.prepare("UPDATE follows SET state = ? WHERE id = ?").bind(state, id).run();
}

export async function deleteFollow(db: D1Database, actorId: string, targetId: string): Promise<void> {
  await db.prepare("DELETE FROM follows WHERE actor_id = ? AND target_id = ?").bind(actorId, targetId).run();
}

export async function getFollowers(db: D1Database, targetId: string): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT a.* FROM actors a JOIN follows f ON f.actor_id = a.id WHERE f.target_id = ? AND f.state = 'accepted'")
    .bind(targetId).all<Row>();
  return results.map(rowToActor);
}

export async function getFollowing(db: D1Database, actorId: string): Promise<LocalActor[]> {
  const { results } = await db
    .prepare("SELECT a.* FROM actors a JOIN follows f ON f.target_id = a.id WHERE f.actor_id = ? AND f.state = 'accepted'")
    .bind(actorId).all<Row>();
  return results.map(rowToActor);
}

export async function getFollowerIds(db: D1Database, targetId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT actor_id FROM follows WHERE target_id = ? AND state = 'accepted'")
    .bind(targetId).all<{ actor_id: string }>();
  return results.map((r) => r.actor_id);
}

// ─── Objects ────────────────────────────────────────

export async function createObject(db: D1Database, obj: { id: string; type: string; actorId: string; content?: string | null; sensitive?: boolean; visibility?: string; url?: string; published?: string; local?: boolean; raw?: string }): Promise<void> {
  await db
    .prepare("INSERT INTO objects (id, type, actor_id, content, sensitive, visibility, url, published, updated_at, is_local, raw) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'), ?, ?)")
    .bind(obj.id, obj.type, obj.actorId, obj.content ?? null, obj.sensitive ? 1 : 0,
      obj.visibility ?? "public", obj.url ?? null, obj.published ?? null,
      obj.local !== false ? 1 : 0, obj.raw ?? "{}")
    .run();
}

export async function getObjectById(db: D1Database, id: string): Promise<LocalObject | null> {
  const row = await db.prepare("SELECT * FROM objects WHERE id = ?").bind(id).first();
  return row ? rowToObject(row) : null;
}

export async function getObjectsByRepo(db: D1Database, actorId: string, repoName: string): Promise<{ id: string; raw: string | null }[]> {
  const { results } = await db
    .prepare("SELECT id, raw FROM objects WHERE actor_id = ? AND type = 'Note' AND url LIKE ?")
    .bind(actorId, `%/${repoName}/-/commit/%`)
    .all<{ id: string; raw: string | null }>();
  return results;
}

export async function deleteObject(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM objects WHERE id = ?").bind(id).run();
}

// ─── Activities ─────────────────────────────────────

export async function createActivity(db: D1Database, act: { id: string; type: string; actorId: string; objectId?: string; toList: string; ccList: string; raw: string; isLocal?: boolean }): Promise<void> {
  await db
    .prepare("INSERT INTO activities (id, type, actor_id, object_id, to_list, cc_list, raw, published, is_local) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)")
    .bind(act.id, act.type, act.actorId, act.objectId ?? null, act.toList, act.ccList, act.raw, act.isLocal ? 1 : 0)
    .run();
}

// ─── Notifications ──────────────────────────────────

export async function getNotifications(db: D1Database, targetAccountId: string, limit = 30, offset = 0): Promise<LocalNotification[]> {
  const { results } = await db
    .prepare("SELECT * FROM notifications WHERE target_account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .bind(targetAccountId, limit, offset).all<Row>();
  return results.map(rowToNotification);
}

export async function createNotification(db: D1Database, notif: { id: string; type: string; accountId: string; targetAccountId: string; objectId?: string | null; read?: boolean; createdAt?: string }): Promise<void> {
  await db
    .prepare("INSERT INTO notifications (id, type, account_id, target_account_id, object_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(notif.id, notif.type, notif.accountId, notif.targetAccountId, notif.objectId ?? null, notif.read ? 1 : 0, notif.createdAt ?? new Date().toISOString())
    .run();
}

export async function markNotificationRead(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").bind(id).run();
}

export async function getUnreadNotificationCount(db: D1Database, targetAccountId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM notifications WHERE target_account_id = ? AND is_read = 0")
    .bind(targetAccountId).first() as { count: number } | null;
  return row?.count ?? 0;
}
