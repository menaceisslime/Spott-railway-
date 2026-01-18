const express = require("express");
const ytdl = require("ytdl-core");
const yts = require("yt-search");
const archiver = require("archiver");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const cleanName = (name) =>
  name.replace(/[\\/\\\\?%*:|"<>]/g, "").slice(0, 120);

let progressStore = {};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const id = Date.now() + "-" + Math.random();
  progressStore[id] = { percent: 0 };

  res.write(`id: ${id}\n`);
  res.write(`data: ${JSON.stringify(progressStore[id])}\n\n`);

  const interval = setInterval(() => {
    if (!progressStore[id]) {
      clearInterval(interval);
      return;
    }
    res.write(`data: ${JSON.stringify(progressStore[id])}\n\n`);
  }, 500);

  req.on("close", () => {
    delete progressStore[id];
    clearInterval(interval);
  });
});

app.get("/song", async (req, res) => {
  try {
    const search = await yts(req.query.q);
    const video = search.videos[0];
    if (!video) return res.status(404).send("No song found");

    const title = cleanName(video.title);
    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp3"`);

    const stream = ytdl(video.url, { filter: "audioonly", quality: "highestaudio" });

    let downloaded = 0;
    let total = 0;

    stream.on("response", (r) => {
      total = parseInt(r.headers["content-length"], 10);
    });

    stream.on("data", (chunk) => {
      downloaded += chunk.length;
      const percent = total ? ((downloaded / total) * 100).toFixed(2) : 0;
      Object.keys(progressStore).forEach((k) => {
        progressStore[k] = { percent };
      });
    });

    stream.pipe(res);
  } catch {
    res.status(500).send("Song download failed");
  }
});

app.get("/video", async (req, res) => {
  try {
    const search = await yts(req.query.q);
    const video = search.videos[0];
    if (!video) return res.status(404).send("No video found");

    const title = cleanName(video.title);
    res.setHeader("Content-Disposition", `attachment; filename="${title}.mp4"`);

    const stream = ytdl(video.url, { filter: "audioandvideo", quality: "highest" });

    let downloaded = 0;
    let total = 0;

    stream.on("response", (r) => {
      total = parseInt(r.headers["content-length"], 10);
    });

    stream.on("data", (chunk) => {
      downloaded += chunk.length;
      const percent = total ? ((downloaded / total) * 100).toFixed(2) : 0;
      Object.keys(progressStore).forEach((k) => {
        progressStore[k] = { percent };
      });
    });

    stream.pipe(res);
  } catch {
    res.status(500).send("Video download failed");
  }
});

app.get("/album", async (req, res) => {
  try {
    const search = await yts(req.query.q);
    const playlist = search.playlists[0];
    if (!playlist) return res.status(404).send("No playlist found");

    const full = await yts({ listId: playlist.listId });

    const title = cleanName(playlist.title);
    res.setHeader("Content-Disposition", `attachment; filename="${title}.zip"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    for (const v of full.videos) {
      archive.append(
        ytdl(v.url, { filter: "audioonly", quality: "highestaudio" }),
        { name: `${cleanName(v.title)}.mp3` }
      );
    }

    archive.finalize();
  } catch {
    res.status(500).send("Album download failed");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on port", PORT));