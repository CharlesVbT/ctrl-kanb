#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const assets = path.join(project, "docs", "assets");
const ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";

const filter = [
  "[0:v]zoompan=z='min(zoom+0.0018,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=35:s=896x560:fps=10,setsar=1[v0]",
  "[1:v]zoompan=z='min(zoom+0.0018,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=35:s=896x560:fps=10,setsar=1[v1]",
  "[2:v]zoompan=z='min(zoom+0.0018,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=35:s=896x560:fps=10,setsar=1[v2]",
  "[3:v]zoompan=z='min(zoom+0.0018,1.06)':x='iw-(iw/zoom)':y='ih/2-(ih/zoom/2)':d=35:s=896x560:fps=10,setsar=1[v3]",
  "[v0][v1]xfade=transition=fade:duration=0.4:offset=3.1[x1]",
  "[x1][v2]xfade=transition=fade:duration=0.4:offset=6.2[x2]",
  "[x2][v3]xfade=transition=fade:duration=0.4:offset=9.3[video]",
  "[video]split[a][b]",
  "[a]palettegen=stats_mode=diff[p]",
  "[b][p]paletteuse=dither=bayer:bayer_scale=4"
].join(";");

const variants = [
  { suffix: "", output: "ctrl-kanb-demo.gif" },
  { suffix: "-fr", output: "ctrl-kanb-demo-fr.gif" }
];

for (const variant of variants) {
  const inputs = ["hero", "board", "agenda", "chat"].map(name =>
    path.join(assets, `ctrl-kanb-${name}${variant.suffix}.png`)
  );
  for (const input of inputs) {
    if (!fs.existsSync(input)) throw new Error(`Capture manquante : ${input}`);
  }

  const target = path.join(assets, variant.output);
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const input of inputs) args.push("-i", input);
  args.push("-filter_complex", filter, "-loop", "0", target);

  const result = childProcess.spawnSync(ffmpeg, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg a échoué pour ${variant.output}.`);
  console.log(`Démonstration créée : ${path.relative(project, target)}`);
}
