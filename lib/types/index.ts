export interface APActor {
  "@context"?: unknown;
  id: string;
  type: string;
  preferredUsername: string;
  name?: string;
  summary?: string;
  url?: string;
  inbox: string;
  outbox: string;
  followers: string;
  following: string;
  liked?: string;
  publicKey: {
    id: string;
    owner: string;
    publicKeyPem: string;
  };
  endpoints?: {
    sharedInbox?: string;
  };
  icon?: { type: string; url: string; mediaType?: string };
  image?: { type: string; url: string; mediaType?: string };
  published?: string;
  manuallyApprovesFollowers?: boolean;
  discoverable?: boolean;
}

export interface APNote {
  "@context"?: unknown;
  id: string;
  type: string;
  attributedTo: string;
  content: string;
  published: string;
  to: string[];
  cc: string[];
  url?: string;
  tag?: { type: string; name: string; href: string }[];
}

export interface APActivity {
  "@context"?: unknown;
  id: string;
  type: string;
  actor: string | APActor;
  object: unknown;
  published?: string;
  to?: string[];
  cc?: string[];
}

export interface APCollection {
  "@context"?: unknown;
  id: string;
  type: string;
  totalItems: number;
  first: string;
}

export interface APCollectionPage {
  "@context"?: unknown;
  id: string;
  type: string;
  partOf: string;
  orderedItems: unknown[];
  next?: string;
  prev?: string;
}

export interface LocalActor {
  id: string;
  username: string;
  domain: string;
  displayName: string | null;
  summary: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  publicKeyPem: string;
  privateKeyPem: string | null;
  isLocal: boolean;
  followersCount: number;
  followingCount: number;
  reposCount: number;
  email: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationSentAt: string | null;
  passwordResetToken: string | null;
  passwordResetExpiresAt: string | null;
  inbox: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalRepo {
  id: string;
  name: string;
  description: string | null;
  actorId: string;
  isPrivate: number;
  isExternal: number;
  externalUrl: string | null;
  cloneUrl: string | null;
  defaultBranch: string;
  objectId: string | null;
  sizeBytes: number;
  commitCount: number;
  starCount: number;
  forkCount: number;
  lastSyncAt: string | null;
  published: string;
  updatedAt: string;
}

export interface LocalCommit {
  id: string;
  repoId: string;
  sha: string;
  treeSha: string;
  parentSha: string | null;
  message: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  committerName: string;
  committerEmail: string;
  committedAt: string;
  isLocal: number;
  objectId: string | null;
}

export interface LocalTreeEntry {
  id: string;
  repoId: string;
  commitSha: string;
  path: string;
  mode: string;
  type: string;
  sha: string;
  size: number | null;
}

export interface LocalRef {
  id: string;
  repoId: string;
  ref: string;
  targetSha: string;
  type: string;
}

export interface LocalFollow {
  id: string;
  actorId: string;
  targetId: string;
  state: string;
  activityId: string | null;
  createdAt: string;
}

export interface LocalObject {
  id: string;
  type: string;
  actorId: string;
  content: string | null;
  sensitive: boolean;
  visibility: string;
  url: string | null;
  published: string;
  updatedAt: string;
  local: boolean;
  raw: string;
}

export interface LocalActivity {
  id: string;
  type: string;
  actorId: string;
  objectId: string | null;
  toList: string;
  ccList: string;
  raw: string;
  published: string;
  isLocal: boolean;
  delivered: boolean;
}

export interface LocalNotification {
  id: string;
  type: string;
  accountId: string;
  targetAccountId: string;
  objectId: string | null;
  read: boolean;
  createdAt: string;
}
