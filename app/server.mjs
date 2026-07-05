import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const dbPath = join(root, "data", "db.json");
const maxBodySize = 25 * 1024 * 1024;

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

function createDefaultData() {
  const now = new Date().toISOString();
  return {
    currentUser: {
      id: "u_founder",
      name: "Founder",
      handle: "@founder",
      initials: "F",
      bio: "Building PulseSpace: focused discovery, text threads, and creator communities.",
      following: ["@maya", "@niab"]
    },
    creators: [
      { id: "u_maya", name: "Maya Chen", handle: "@maya", initials: "MC", niche: "Creator strategy", followers: "82K" },
      { id: "u_arjun", name: "Arjun Patel", handle: "@arjunbuilds", initials: "AP", niche: "Fitness systems", followers: "41K" },
      { id: "u_nia", name: "Nia Brooks", handle: "@niab", initials: "NB", niche: "Indie music", followers: "128K" }
    ],
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
        comments: [
          { id: "cm1", author: "Founder", initials: "F", text: "This is the right direction for text posts.", createdAt: now }
        ]
      },
      {
        id: "p2",
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
        comments: [
          { id: "cm2", author: "Maya Chen", initials: "MC", text: "The layout feels much more scannable.", createdAt: now }
        ]
      },
      {
        id: "p3",
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

async function readDb() {
  await ensureDb();
  const raw = await readFile(dbPath, "utf8");
  const db = JSON.parse(raw);
  db.posts ??= [];
  db.communities ??= [];
  db.creators ??= [];
  db.messages ??= [];
  return db;
}

async function writeDb(db) {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function badRequest(response, message) {
  json(response, 400, { error: message });
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

function normalizePost(post, currentUser) {
  return {
    ...post,
    liked: post.likedBy?.includes(currentUser.id) || false,
    saved: post.savedBy?.includes(currentUser.id) || false,
    commentsCount: post.comments?.length || 0
  };
}

function normalizePosts(db, posts = db.posts) {
  return posts.map((post) => normalizePost(post, db.currentUser));
}

function findPost(db, postId) {
  return db.posts.find((post) => post.id === postId);
}

function filterPosts(db, url) {
  const scope = url.searchParams.get("scope") || "for-you";
  const type = url.searchParams.get("type") || "all";
  const author = url.searchParams.get("author");
  const following = new Set(db.currentUser.following || []);

  let posts = [...db.posts];
  if (scope === "following") {
    posts = posts.filter((post) => following.has(post.handle) || post.handle === db.currentUser.handle);
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

function search(db, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return { posts: [], creators: [], communities: [] };
  }

  const includes = (...values) => values.join(" ").toLowerCase().includes(needle);
  return {
    posts: normalizePosts(
      db,
      db.posts.filter((post) =>
        includes(post.author, post.handle, post.community, post.type, post.text, post.tag)
      )
    ),
    creators: db.creators.filter((creator) =>
      includes(creator.name, creator.handle, creator.niche, creator.followers)
    ),
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

async function handleApi(request, response, url) {
  const db = await readDb();
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    json(response, 200, {
      currentUser: db.currentUser,
      creators: db.creators,
      communities: db.communities,
      messages: db.messages,
      posts: normalizePosts(db)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/posts") {
    json(response, 200, { posts: normalizePosts(db, filterPosts(db, url)) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/search") {
    json(response, 200, search(db, url.searchParams.get("q") || ""));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/posts") {
    const payload = await readJsonBody(request);
    const validated = validatePostPayload(payload);
    if (validated.error) {
      badRequest(response, validated.error);
      return;
    }

    const post = {
      id: `p${Date.now()}`,
      author: db.currentUser.name,
      handle: db.currentUser.handle,
      initials: db.currentUser.initials,
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
    json(response, 201, { post: normalizePost(post, db.currentUser) });
    return;
  }

  if (segments[0] === "api" && segments[1] === "posts" && segments[2] && request.method === "POST") {
    const post = findPost(db, segments[2]);
    if (!post) {
      json(response, 404, { error: "Post not found." });
      return;
    }

    if (segments[3] === "like") {
      post.likedBy ??= [];
      const index = post.likedBy.indexOf(db.currentUser.id);
      if (index >= 0) {
        post.likedBy.splice(index, 1);
        post.likes = Math.max(0, post.likes - 1);
      } else {
        post.likedBy.push(db.currentUser.id);
        post.likes += 1;
      }
      await writeDb(db);
      json(response, 200, { post: normalizePost(post, db.currentUser) });
      return;
    }

    if (segments[3] === "save") {
      post.savedBy ??= [];
      const index = post.savedBy.indexOf(db.currentUser.id);
      if (index >= 0) {
        post.savedBy.splice(index, 1);
      } else {
        post.savedBy.push(db.currentUser.id);
      }
      await writeDb(db);
      json(response, 200, { post: normalizePost(post, db.currentUser) });
      return;
    }

    if (segments[3] === "share") {
      post.shares += 1;
      await writeDb(db);
      json(response, 200, {
        post: normalizePost(post, db.currentUser),
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
        author: db.currentUser.name,
        initials: db.currentUser.initials,
        text,
        createdAt: new Date().toISOString()
      });
      await writeDb(db);
      json(response, 201, { post: normalizePost(post, db.currentUser) });
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
