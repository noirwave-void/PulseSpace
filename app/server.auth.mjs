import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const dbPath = join(root, "data", "db.json");
const maxBodySize = 25 * 1024 * 1024;
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4"
};

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: scryptSync(password, salt, 64).toString("hex")
  };
}

function verifyPassword(password, user) {
  if (!user.passwordHash || !user.passwordSalt) return false;
  const attempted = Buffer.from(scryptSync(password, user.passwordSalt, 64).toString("hex"), "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  return attempted.length === stored.length && timingSafeEqual(attempted, stored);
}

function normalizeHandle(value) {
  const trimmed = String(value || "").trim().toLowerCase().replace(/^@/, "");
  return trimmed ? `@${trimmed.replace(/[^a-z0-9_.]/g, "")}` : "";
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (parts[0]?.[0] || "U").toUpperCase() + (parts[1]?.[0] || "").toUpperCase();
}

function createUser({ id, name, handle, email, bio, website = "", password, followers = "0", following = [] }) {
  const credentials = password ? hashPassword(password) : { salt: "", hash: "" };
  return {
    id: id || `u_${randomBytes(6).toString("hex")}`,
    name,
    handle: normalizeHandle(handle),
    email: email ? String(email).trim().toLowerCase() : "",
    initials: initialsFromName(name),
    bio,
    website,
    avatarUrl: "",
    followers,
    following,
    passwordSalt: credentials.salt,
    passwordHash: credentials.hash,
    createdAt: new Date().toISOString()
  };
}

function createDefaultData() {
  const now = new Date().toISOString();
  const founder = createUser({
    id: "u_founder",
    name: "Founder",
    handle: "@founder",
    email: "founder@pulsespace.local",
    password: "password123",
    followers: "12.8K",
    bio: "Building PulseSpace: focused discovery, text threads, and creator communities.",
    website: "pulsespace.local",
    following: ["u_maya", "u_nia"]
  });

  const maya = createUser({
    id: "u_maya",
    name: "Maya Chen",
    handle: "@maya",
    followers: "82K",
    bio: "Creator strategy, hooks, and growth systems.",
    website: "maya.creator"
  });
  const arjun = createUser({
    id: "u_arjun",
    name: "Arjun Patel",
    handle: "@arjunbuilds",
    followers: "41K",
    bio: "Fitness systems and challenge design.",
    website: "arjunbuilds.fit"
  });
  const nia = createUser({
    id: "u_nia",
    name: "Nia Brooks",
    handle: "@niab",
    followers: "128K",
    bio: "Indie music, live rooms, and fan communities.",
    website: "niab.live"
  });

  return {
    version: 3,
    users: [founder, maya, arjun, nia],
    sessions: [],
    communities: [
      { id: "c_creator", name: "Creator Lab", initials: "CL", members: "42.8K", focus: "Hooks, edits, analytics, launch experiments, and monetization." },
      { id: "c_food", name: "Local Food Finds", initials: "LF", members: "18.4K", focus: "Short reviews, maps, neighborhood guides, and meetups." },
      { id: "c_fitness", name: "Fitness Builders", initials: "FB", members: "31.1K", focus: "Challenges, accountability pods, workouts, and coach recaps." },
      { id: "c_music", name: "Indie Music", initials: "IM", members: "22.6K", focus: "Song previews, live sets, remix threads, and fan rooms." }
    ],
    messages: [
      { id: "m1", from: "Creator Lab", initials: "CL", text: "Weekly growth review starts in 20 minutes.", time: "9:40" },
      { id: "m2", from: "Maya Chen", initials: "MC", text: "Can you review the hook on the new clip?", time: "8:12" },
      { id: "m3", from: "Fitness Pod", initials: "FP", text: "Four members completed today's challenge.", time: "7:55" }
    ],
    posts: [
      {
        id: "p1",
        authorId: "u_maya",
        author: "Maya Chen",
        handle: "@maya",
        initials: "MC",
        community: "Creator Lab",
        type: "text",
        text: "Text-only posts should feel fast, readable, and conversational. This is the Threads-style surface for updates, questions, and sharp takes.",
        tag: "product",
        mediaUrl: "",
        createdAt: now,
        likes: 422,
        shares: 19,
        likedBy: ["u_founder"],
        savedBy: [],
        comments: [{ id: "cm1", authorId: "u_founder", author: "Founder", initials: "F", text: "This is the right direction for text posts.", createdAt: now }]
      },
      {
        id: "p2",
        authorId: "u_arjun",
        author: "Arjun Patel",
        handle: "@arjunbuilds",
        initials: "AP",
        community: "Fitness Builders",
        type: "photo",
        text: "A cleaner feed gives the content room to breathe.",
        tag: "fitness",
        mediaUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80",
        createdAt: now,
        likes: 932,
        shares: 52,
        likedBy: [],
        savedBy: ["u_founder"],
        comments: [{ id: "cm2", authorId: "u_maya", author: "Maya Chen", initials: "MC", text: "The layout feels much more scannable.", createdAt: now }]
      },
      {
        id: "p3",
        authorId: "u_nia",
        author: "Nia Brooks",
        handle: "@niab",
        initials: "NB",
        community: "Indie Music",
        type: "video",
        text: "Discovery should keep attention on one piece of content at a time.",
        tag: "music",
        mediaUrl: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80",
        createdAt: now,
        likes: 1670,
        shares: 127,
        likedBy: [],
        savedBy: [],
        comments: []
      }
    ]
  };
}

async function ensureDb() {
  await mkdir(dirname(dbPath), { recursive: true });
  try {
    await readFile(dbPath, "utf8");
  } catch {
    await writeFile(dbPath, JSON.stringify(createDefaultData(), null, 2));
  }
}

function publicUser(user, currentUser = null, db = null) {
  const followerCount = db
    ? db.users.filter((candidate) => (candidate.following || []).includes(user.id)).length
    : 0;
  return {
    id: user.id,
    name: user.name,
    handle: user.handle,
    initials: user.initials,
    bio: user.bio,
    website: user.website || "",
    avatarUrl: user.avatarUrl || "",
    followers: user.followers || String(followerCount),
    followersCount: followerCount,
    followingCount: user.following?.length || 0,
    isFollowing: currentUser ? (currentUser.following || []).includes(user.id) : false
  };
}

function currentUserPayload(user, db) {
  return {
    ...publicUser(user, user, db),
    email: user.email,
    following: user.following || []
  };
}

function migrateDb(db) {
  let changed = false;
  db.version ??= 1;
  db.sessions ??= [];
  db.posts ??= [];
  db.communities ??= [];
  db.messages ??= [];

  if (!Array.isArray(db.users)) {
    changed = true;
    const legacyCurrent = db.currentUser || {
      id: "u_founder",
      name: "Founder",
      handle: "@founder",
      bio: "Building PulseSpace: focused discovery, text threads, and creator communities.",
      following: ["@maya", "@niab"]
    };

    const founder = createUser({
      id: legacyCurrent.id || "u_founder",
      name: legacyCurrent.name || "Founder",
      handle: legacyCurrent.handle || "@founder",
      email: "founder@pulsespace.local",
      password: "password123",
      followers: "12.8K",
      bio: legacyCurrent.bio || "",
      website: "pulsespace.local",
      following: legacyCurrent.following || []
    });

    const creatorUsers = (db.creators || []).map((creator) =>
      createUser({
        id: creator.id,
        name: creator.name,
        handle: creator.handle,
        followers: creator.followers || "0",
        bio: creator.niche || "",
        website: ""
      })
    );

    db.users = [founder, ...creatorUsers];
  }

  const userByHandle = new Map(db.users.map((user) => [normalizeHandle(user.handle), user]));
  const userById = new Map(db.users.map((user) => [user.id, user]));

  for (const user of db.users) {
    const normalized = normalizeHandle(user.handle);
    if (user.handle !== normalized) {
      user.handle = normalized;
      changed = true;
    }
    user.initials ||= initialsFromName(user.name);
    user.bio ||= "";
    user.website ||= "";
    user.avatarUrl ||= "";
    user.followers ||= user.id === "u_founder" ? "12.8K" : "0";
    user.following ??= [];
    const mappedFollowing = user.following
      .map((item) => {
        if (userById.has(item)) return item;
        return userByHandle.get(normalizeHandle(item))?.id;
      })
      .filter(Boolean)
      .filter((id) => id !== user.id);
    if (JSON.stringify(mappedFollowing) !== JSON.stringify(user.following)) {
      user.following = [...new Set(mappedFollowing)];
      changed = true;
    }
    if (user.id === "u_founder" && (!user.passwordHash || !user.passwordSalt)) {
      const credentials = hashPassword("password123");
      user.email ||= "founder@pulsespace.local";
      user.passwordSalt = credentials.salt;
      user.passwordHash = credentials.hash;
      changed = true;
    }
  }

  for (const post of db.posts) {
    const author = userByHandle.get(normalizeHandle(post.handle)) || userById.get(post.authorId);
    if (author) {
      if (post.authorId !== author.id) {
        post.authorId = author.id;
        changed = true;
      }
      post.author = author.name;
      post.handle = author.handle;
      post.initials = author.initials;
    }
    post.likedBy ??= [];
    post.savedBy ??= [];
    post.comments ??= [];
    for (const comment of post.comments) {
      const commenter =
        userById.get(comment.authorId) ||
        db.users.find((user) => user.name === comment.author || user.initials === comment.initials);
      if (commenter && comment.authorId !== commenter.id) {
        comment.authorId = commenter.id;
        changed = true;
      }
    }
  }

  if (db.version !== 3) {
    db.version = 3;
    changed = true;
  }

  return { db, changed };
}

async function readDb() {
  await ensureDb();
  const raw = await readFile(dbPath, "utf8");
  const parsed = JSON.parse(raw);
  const { db, changed } = migrateDb(parsed);
  if (changed) {
    await writeDb(db);
  }
  return db;
}

async function writeDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(payload));
}

function badRequest(response, message) {
  json(response, 400, { error: message });
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const index = cookie.indexOf("=");
        return [decodeURIComponent(cookie.slice(0, index)), decodeURIComponent(cookie.slice(index + 1))];
      })
  );
}

function getSession(db, request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const token = cookies.ps_session;
  if (!token) return null;
  const now = Date.now();
  const session = db.sessions.find((item) => item.id === token && new Date(item.expiresAt).getTime() > now);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { session, user } : null;
}

function requireUser(db, request, response) {
  const auth = getSession(db, request);
  if (!auth) {
    json(response, 401, { error: "Sign in to continue." });
    return null;
  }
  return auth.user;
}

function createSession(db, user) {
  const session = {
    id: randomBytes(32).toString("hex"),
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + sessionTtlMs).toISOString()
  };
  db.sessions = (db.sessions || []).filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  db.sessions.push(session);
  return session;
}

function sessionCookie(session) {
  return `ps_session=${encodeURIComponent(session.id)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(sessionTtlMs / 1000)}`;
}

function clearSessionCookie() {
  return "ps_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodySize) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizePost(post, currentUser = null) {
  return {
    ...post,
    liked: currentUser ? post.likedBy?.includes(currentUser.id) || false : false,
    saved: currentUser ? post.savedBy?.includes(currentUser.id) || false : false,
    commentsCount: post.comments?.length || 0
  };
}

function normalizePosts(posts, currentUser = null) {
  return posts.map((post) => normalizePost(post, currentUser));
}

function bootstrapPayload(db, currentUser = null) {
  return {
    currentUser: currentUser ? currentUserPayload(currentUser, db) : null,
    users: db.users.map((user) => publicUser(user, currentUser, db)),
    creators: db.users.map((user) => publicUser(user, currentUser, db)),
    communities: db.communities,
    messages: currentUser ? db.messages : [],
    posts: normalizePosts(db.posts, currentUser)
  };
}

function findPost(db, postId) {
  return db.posts.find((post) => post.id === postId);
}

function filterPosts(db, url, currentUser) {
  const scope = url.searchParams.get("scope") || "for-you";
  const type = url.searchParams.get("type") || "all";
  const author = normalizeHandle(url.searchParams.get("author") || "");
  const following = new Set(currentUser?.following || []);

  let posts = [...db.posts];
  if (scope === "following" && currentUser) {
    posts = posts.filter((post) => following.has(post.authorId) || post.authorId === currentUser.id);
  }
  if (type === "media") {
    posts = posts.filter((post) => post.type === "photo" || post.type === "video");
  }
  if (type === "threads") {
    posts = posts.filter((post) => post.type === "text");
  }
  if (author) {
    posts = posts.filter((post) => post.handle === author);
  }

  return posts.sort((a, b) => {
    if (scope === "for-you") {
      return b.likes + b.shares + (b.comments?.length || 0) - (a.likes + a.shares + (a.comments?.length || 0));
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function search(db, query, currentUser) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return { posts: [], users: [], creators: [], communities: [] };
  }

  const includes = (...values) => values.join(" ").toLowerCase().includes(needle);
  const users = db.users
    .filter((user) => includes(user.name, user.handle, user.bio, user.website))
    .map((user) => publicUser(user, currentUser, db));
  return {
    posts: normalizePosts(
      db.posts.filter((post) =>
        includes(post.author, post.handle, post.community, post.type, post.text, post.tag)
      ),
      currentUser
    ),
    users,
    creators: users,
    communities: db.communities.filter((community) =>
      includes(community.name, community.members, community.focus)
    )
  };
}

function validatePostPayload(payload) {
  const type = String(payload.type || "").trim();
  const text = String(payload.text || "").trim();
  const community = String(payload.community || "").trim();
  const mediaUrl = String(payload.mediaUrl || "").trim();

  if (!["text", "photo", "video"].includes(type)) {
    return { error: "Choose text, photo, or video." };
  }
  if (!text || text.length > 500) {
    return { error: "Post text is required and must be 500 characters or less." };
  }
  if (!community) {
    return { error: "Choose a community." };
  }
  if ((type === "photo" || type === "video") && !mediaUrl) {
    return { error: "Upload media before publishing this post type." };
  }

  return { type, text, community, mediaUrl };
}

function validateSignup(payload, db) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const handle = normalizeHandle(payload.handle || name);
  const password = String(payload.password || "");

  if (!name || name.length > 60) return { error: "Enter a display name under 60 characters." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  if (!/^@[a-z0-9_.]{3,24}$/.test(handle)) return { error: "Handle must be 3-24 letters, numbers, dots, or underscores." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (db.users.some((user) => user.email === email)) return { error: "Email is already registered." };
  if (db.users.some((user) => user.handle === handle)) return { error: "Handle is already taken." };

  return { name, email, handle, password };
}

async function handleApi(request, response, url) {
  const db = await readDb();
  const auth = getSession(db, request);
  const currentUser = auth?.user || null;
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    json(response, 200, bootstrapPayload(db, currentUser));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/signup") {
    const payload = await readJsonBody(request);
    const validated = validateSignup(payload, db);
    if (validated.error) {
      badRequest(response, validated.error);
      return;
    }

    const user = createUser({
      name: validated.name,
      handle: validated.handle,
      email: validated.email,
      password: validated.password,
      followers: "0",
      bio: "New to PulseSpace.",
      website: ""
    });
    db.users.push(user);
    const session = createSession(db, user);
    await writeDb(db);
    json(response, 201, { user: currentUserPayload(user, db) }, { "set-cookie": sessionCookie(session) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJsonBody(request);
    const identifier = String(payload.identifier || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const handle = normalizeHandle(identifier);
    const user = db.users.find((candidate) => candidate.email === identifier || candidate.handle === handle);

    if (!user || !verifyPassword(password, user)) {
      json(response, 401, { error: "Invalid email, handle, or password." });
      return;
    }

    const session = createSession(db, user);
    await writeDb(db);
    json(response, 200, { user: currentUserPayload(user, db) }, { "set-cookie": sessionCookie(session) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if (auth) {
      db.sessions = db.sessions.filter((session) => session.id !== auth.session.id);
      await writeDb(db);
    }
    json(response, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    json(response, 200, { currentUser: currentUser ? currentUserPayload(currentUser, db) : null });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/posts") {
    json(response, 200, { posts: normalizePosts(filterPosts(db, url, currentUser), currentUser) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/search") {
    json(response, 200, search(db, url.searchParams.get("q") || "", currentUser));
    return;
  }

  if (request.method === "GET" && segments[0] === "api" && segments[1] === "users" && segments[2]) {
    const handle = normalizeHandle(segments[2]);
    const user = db.users.find((candidate) => candidate.handle === handle);
    if (!user) {
      json(response, 404, { error: "User not found." });
      return;
    }
    json(response, 200, {
      user: publicUser(user, currentUser, db),
      posts: normalizePosts(db.posts.filter((post) => post.authorId === user.id), currentUser)
    });
    return;
  }

  if (request.method === "POST" && segments[0] === "api" && segments[1] === "users" && segments[2] && segments[3] === "follow") {
    const user = requireUser(db, request, response);
    if (!user) return;
    const handle = normalizeHandle(segments[2]);
    const target = db.users.find((candidate) => candidate.handle === handle);
    if (!target) {
      json(response, 404, { error: "User not found." });
      return;
    }
    if (target.id === user.id) {
      badRequest(response, "You cannot follow yourself.");
      return;
    }
    user.following ??= [];
    if (user.following.includes(target.id)) {
      user.following = user.following.filter((id) => id !== target.id);
    } else {
      user.following.push(target.id);
    }
    await writeDb(db);
    json(response, 200, {
      currentUser: currentUserPayload(user, db),
      user: publicUser(target, user, db)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/posts") {
    const user = requireUser(db, request, response);
    if (!user) return;

    const payload = await readJsonBody(request);
    const validated = validatePostPayload(payload);
    if (validated.error) {
      badRequest(response, validated.error);
      return;
    }

    const post = {
      id: `p${Date.now()}`,
      authorId: user.id,
      author: user.name,
      handle: user.handle,
      initials: user.initials,
      community: validated.community,
      type: validated.type,
      text: validated.text,
      tag: validated.community.toLowerCase().replaceAll(" ", ""),
      mediaUrl: validated.mediaUrl,
      createdAt: new Date().toISOString(),
      likes: 0,
      shares: 0,
      likedBy: [],
      savedBy: [],
      comments: []
    };

    db.posts.unshift(post);
    await writeDb(db);
    json(response, 201, { post: normalizePost(post, user) });
    return;
  }

  if (segments[0] === "api" && segments[1] === "posts" && segments[2] && request.method === "POST") {
    const user = requireUser(db, request, response);
    if (!user) return;

    const post = findPost(db, segments[2]);
    if (!post) {
      json(response, 404, { error: "Post not found." });
      return;
    }

    if (segments[3] === "like") {
      post.likedBy ??= [];
      const index = post.likedBy.indexOf(user.id);
      if (index >= 0) {
        post.likedBy.splice(index, 1);
        post.likes = Math.max(0, post.likes - 1);
      } else {
        post.likedBy.push(user.id);
        post.likes += 1;
      }
      await writeDb(db);
      json(response, 200, { post: normalizePost(post, user) });
      return;
    }

    if (segments[3] === "save") {
      post.savedBy ??= [];
      const index = post.savedBy.indexOf(user.id);
      if (index >= 0) {
        post.savedBy.splice(index, 1);
      } else {
        post.savedBy.push(user.id);
      }
      await writeDb(db);
      json(response, 200, { post: normalizePost(post, user) });
      return;
    }

    if (segments[3] === "share") {
      post.shares += 1;
      await writeDb(db);
      json(response, 200, {
        post: normalizePost(post, user),
        shareUrl: `http://localhost:${port}/?post=${post.id}`
      });
      return;
    }

    if (segments[3] === "comments") {
      const payload = await readJsonBody(request);
      const text = String(payload.text || "").trim();
      if (!text || text.length > 280) {
        badRequest(response, "Comment is required and must be 280 characters or less.");
        return;
      }
      post.comments ??= [];
      post.comments.push({
        id: `cm${Date.now()}`,
        authorId: user.id,
        author: user.name,
        initials: user.initials,
        text,
        createdAt: new Date().toISOString()
      });
      await writeDb(db);
      json(response, 201, { post: normalizePost(post, user) });
      return;
    }
  }

  json(response, 404, { error: "API route not found." });
}

async function handleStatic(response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await handleStatic(response, url);
  } catch (error) {
    const status = error.statusCode || 500;
    json(response, status, { error: error.message || "Internal server error." });
  }
});

await ensureDb();

server.listen(port, () => {
  console.log(`PulseSpace running at http://localhost:${port}`);
});
