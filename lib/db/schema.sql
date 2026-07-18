-- cf-git D1 Database Schema

CREATE TABLE IF NOT EXISTS actors (
  id                          TEXT PRIMARY KEY,
  username                    TEXT NOT NULL,
  domain                      TEXT NOT NULL,
  display_name                TEXT,
  summary                     TEXT,
  avatar_url                  TEXT,
  header_url                  TEXT,
  public_key_pem              TEXT NOT NULL,
  private_key_pem             TEXT,
  is_local                    INTEGER NOT NULL DEFAULT 0,
  followers_count             INTEGER NOT NULL DEFAULT 0,
  following_count             INTEGER NOT NULL DEFAULT 0,
  repos_count                 INTEGER NOT NULL DEFAULT 0,
  email                       TEXT UNIQUE,
  password_hash               TEXT,
  email_verified              INTEGER NOT NULL DEFAULT 0,
  email_verification_token    TEXT,
  email_verification_sent_at  TEXT,
  password_reset_token        TEXT,
  password_reset_expires_at   TEXT,
  inbox                       TEXT,
  created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (username, domain)
);

CREATE INDEX IF NOT EXISTS idx_actors_domain ON actors(domain);
CREATE INDEX IF NOT EXISTS idx_actors_is_local ON actors(is_local);
CREATE INDEX IF NOT EXISTS idx_actors_email ON actors(email);

CREATE TABLE IF NOT EXISTS repos (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  actor_id      TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  is_private    INTEGER NOT NULL DEFAULT 0,
  is_external   INTEGER NOT NULL DEFAULT 0,
  external_url  TEXT,
  clone_url     TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  object_id     TEXT REFERENCES objects(id) ON DELETE SET NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  commit_count  INTEGER NOT NULL DEFAULT 0,
  star_count    INTEGER NOT NULL DEFAULT 0,
  fork_count    INTEGER NOT NULL DEFAULT 0,
  last_sync_at  TEXT,
  published     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_repos_actor ON repos(actor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repos_name_actor ON repos(actor_id, name);

CREATE TABLE IF NOT EXISTS repo_commits (
  id              TEXT PRIMARY KEY,
  repo_id         TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  sha             TEXT NOT NULL,
  tree_sha        TEXT NOT NULL,
  parent_sha      TEXT,
  message         TEXT NOT NULL,
  author_name     TEXT NOT NULL,
  author_email    TEXT NOT NULL,
  authored_at     TEXT NOT NULL,
  committer_name  TEXT NOT NULL,
  committer_email TEXT NOT NULL,
  committed_at    TEXT NOT NULL,
  is_local        INTEGER NOT NULL DEFAULT 1,
  object_id       TEXT REFERENCES objects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commits_repo ON repo_commits(repo_id);
CREATE INDEX IF NOT EXISTS idx_commits_sha ON repo_commits(sha);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commits_repo_sha ON repo_commits(repo_id, sha);

CREATE TABLE IF NOT EXISTS repo_trees (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  commit_sha  TEXT NOT NULL,
  path        TEXT NOT NULL,
  mode        TEXT NOT NULL,
  type        TEXT NOT NULL,
  sha         TEXT NOT NULL,
  size        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trees_repo ON repo_trees(repo_id);
CREATE INDEX IF NOT EXISTS idx_trees_commit ON repo_trees(commit_sha);

CREATE TABLE IF NOT EXISTS repo_refs (
  id          TEXT PRIMARY KEY,
  repo_id     TEXT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,
  target_sha  TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'branch'
);

CREATE INDEX IF NOT EXISTS idx_refs_repo ON repo_refs(repo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refs_repo_ref ON repo_refs(repo_id, ref);

CREATE TABLE IF NOT EXISTS objects (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'Note',
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  content     TEXT,
  sensitive   INTEGER NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'public',
  url         TEXT,
  published   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  is_local    INTEGER NOT NULL DEFAULT 0,
  raw         TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_objects_actor_id ON objects(actor_id);
CREATE INDEX IF NOT EXISTS idx_objects_published ON objects(published DESC);

CREATE TABLE IF NOT EXISTS follows (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  state       TEXT NOT NULL DEFAULT 'pending',
  activity_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (actor_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_actor ON follows(actor_id, state);
CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_id, state);

CREATE TABLE IF NOT EXISTS activities (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  object_id   TEXT,
  to_list     TEXT NOT NULL DEFAULT '[]',
  cc_list     TEXT NOT NULL DEFAULT '[]',
  raw         TEXT NOT NULL DEFAULT '{}',
  published   TEXT NOT NULL DEFAULT (datetime('now')),
  is_local    INTEGER NOT NULL DEFAULT 0,
  delivered   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_activities_actor ON activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);

CREATE TABLE IF NOT EXISTS notifications (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  account_id        TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  target_account_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  object_id         TEXT,
  is_read           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_target ON notifications(target_account_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_failures (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  inbox_url   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  next_retry  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_actor ON sessions(actor_id);
