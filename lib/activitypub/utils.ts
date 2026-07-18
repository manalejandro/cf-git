import { DEFAULT_CONTEXT, PUBLIC_ADDRESS } from "./vocab";
import type { APActor, APNote, APActivity, APCollection, APCollectionPage } from "@/lib/types";

export function generateId(): string {
  return crypto.randomUUID();
}

export function actorIRI(baseUrl: string, username: string): string {
  return `${baseUrl}/users/${username.toLowerCase()}`;
}

export function objectIRI(baseUrl: string, id: string): string {
  return `${baseUrl}/objects/${id}`;
}

export function activityIRI(baseUrl: string, id: string): string {
  return `${baseUrl}/activities/${id}`;
}

export function inboxIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/inbox`;
}

export function outboxIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/outbox`;
}

export function followersIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/followers`;
}

export function followingIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}/following`;
}

export function keyIRI(baseUrl: string, username: string): string {
  return `${actorIRI(baseUrl, username)}#main-key`;
}

export function repoIRI(baseUrl: string, username: string, repoName: string): string {
  return `${baseUrl}/users/${username.toLowerCase()}/${repoName}`;
}

export function commitIRI(baseUrl: string, username: string, repoName: string, sha: string): string {
  return `${repoIRI(baseUrl, username, repoName)}/commits/${sha}`;
}

export function buildActor(
  baseUrl: string,
  username: string,
  options: {
    displayName?: string;
    summary?: string;
    avatarUrl?: string | null;
    headerUrl?: string | null;
    publicKeyPem: string;
    followersCount?: number;
    followingCount?: number;
    reposCount?: number;
    published?: string;
  }
): APActor {
  const id = actorIRI(baseUrl, username);
  return {
    "@context": DEFAULT_CONTEXT,
    id,
    type: "Person",
    preferredUsername: username,
    name: options.displayName ?? username,
    summary: options.summary ?? "",
    url: `${baseUrl}/@${username}`,
    inbox: inboxIRI(baseUrl, username),
    outbox: outboxIRI(baseUrl, username),
    followers: followersIRI(baseUrl, username),
    following: followingIRI(baseUrl, username),
    publicKey: {
      id: keyIRI(baseUrl, username),
      owner: id,
      publicKeyPem: options.publicKeyPem,
    },
    discoverable: true,
    published: options.published ?? new Date().toISOString(),
    endpoints: {
      sharedInbox: `${baseUrl}/inbox`,
    },
    ...(options.avatarUrl ? { icon: { type: "Image" as const, url: options.avatarUrl, mediaType: "image/webp" } } : {}),
  } as APActor;
}

export function buildRepoNote(
  baseUrl: string,
  id: string,
  options: {
    actorUsername: string;
    repoName: string;
    description?: string;
    cloneUrl?: string;
    defaultBranch: string;
    published: string;
  }
): APNote {
  const actorId = actorIRI(baseUrl, options.actorUsername);
  const noteId = objectIRI(baseUrl, id);
  const repoUrl = `${baseUrl}/r/${options.actorUsername}/${options.repoName}`;

  const content = `<p>📦 <a href="${escapeHtml(repoUrl)}">${escapeHtml(options.actorUsername)}/${escapeHtml(options.repoName)}</a></p>`
    + (options.description ? `<p>${escapeHtml(options.description)}</p>` : "")
    + `<p>Branch: ${escapeHtml(options.defaultBranch)}</p>`
    + (options.cloneUrl ? `<p>Clone: <code>${escapeHtml(options.cloneUrl)}</code></p>` : "");

  return {
    "@context": DEFAULT_CONTEXT,
    id: noteId,
    type: "Note",
    attributedTo: actorId,
    content,
    published: options.published,
    to: [PUBLIC_ADDRESS],
    cc: [followersIRI(baseUrl, options.actorUsername)],
    url: repoUrl,
    tag: [{ type: "Hashtag", name: "#git", href: `${baseUrl}/tags/git` }],
  } as APNote;
}

export function buildCommitNote(
  baseUrl: string,
  id: string,
  options: {
    actorUsername: string;
    repoName: string;
    sha: string;
    message: string;
    authorName: string;
    published: string;
  }
): APNote {
  const actorId = actorIRI(baseUrl, options.actorUsername);
  const noteId = objectIRI(baseUrl, id);
  const shortSha = options.sha.slice(0, 7);
  const commitUrl = `${repoIRI(baseUrl, options.actorUsername, options.repoName)}/commits/${options.sha}`;

  const content = `<p>📝 <a href="${escapeHtml(commitUrl)}">${escapeHtml(options.actorUsername)}/${escapeHtml(options.repoName)}@${escapeHtml(shortSha)}</a></p>`
    + `<pre style="background:#f5f5f5;padding:8px;border-radius:4px;font-size:13px">${escapeHtml(options.message.split('\n')[0])}</pre>`
    + `<p>by ${escapeHtml(options.authorName)}</p>`;

  return {
    "@context": DEFAULT_CONTEXT,
    id: noteId,
    type: "Note",
    attributedTo: actorId,
    content,
    published: options.published,
    to: [PUBLIC_ADDRESS],
    cc: [followersIRI(baseUrl, options.actorUsername)],
    url: commitUrl,
    tag: [{ type: "Hashtag", name: "#git", href: `${baseUrl}/tags/git` }],
  } as APNote;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildCreate(baseUrl: string, actorId: string, note: APNote, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Create",
    actor: actorId,
    published: note.published,
    to: note.to,
    cc: note.cc,
    object: note,
  } as APActivity;
}

export function buildFollow(baseUrl: string, actorId: string, targetId: string, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Follow",
    actor: actorId,
    object: targetId,
    to: [targetId],
  } as APActivity;
}

export function buildAccept(baseUrl: string, actorId: string, followActivity: APActivity, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Accept",
    actor: actorId,
    object: followActivity,
    to: [typeof followActivity.actor === "string" ? followActivity.actor : followActivity.actor.id],
  } as APActivity;
}

export function buildDelete(baseUrl: string, actorId: string, objectId: string, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Delete",
    actor: actorId,
    object: { id: objectId, type: "Tombstone" },
    to: [PUBLIC_ADDRESS],
  } as APActivity;
}

export function buildUndo(baseUrl: string, actorId: string, activity: APActivity, id: string): APActivity {
  return {
    "@context": DEFAULT_CONTEXT,
    id: activityIRI(baseUrl, id),
    type: "Undo",
    actor: actorId,
    object: activity,
    to: activity.to ?? [PUBLIC_ADDRESS],
    cc: activity.cc,
  } as APActivity;
}

export function buildOrderedCollection(id: string, totalItems: number): APCollection {
  return {
    "@context": DEFAULT_CONTEXT,
    id,
    type: "OrderedCollection",
    totalItems,
    first: `${id}?page=true`,
  } as APCollection;
}

export function buildOrderedCollectionPage(
  collectionId: string,
  items: unknown[],
  nextId?: string,
  prevId?: string
): APCollectionPage {
  const page: APCollectionPage = {
    "@context": DEFAULT_CONTEXT,
    id: `${collectionId}?page=true`,
    type: "OrderedCollectionPage",
    partOf: collectionId,
    orderedItems: items as never[],
  };
  if (nextId) page.next = nextId;
  if (prevId) page.prev = prevId;
  return page;
}
