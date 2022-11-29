import "@actions/core";
import "@actions/github";
import fetch from "node-fetch";
import parseDiff from "parse-diff";
import { detectClones } from "jscpd";
import fs from "fs";
import path from "path";

async function getChangedRanges2(diffUrl) {
  const response = await fetch(diffUrl);
  const diffText = await response.text();
  const diff = parseDiff(diffText);
  /** maps files to a list of {from:int, to:int} */
  const changedRanges = {};
  for (const file of diff) {
    const ranges = [];
    for (const c of file.chunks) {
      ranges.push({ start: c.newStart, end: c.newStart + c.newLines });
    }
    changedRanges[file.to] = ranges;
  }
  return changedRanges;
}

async function getChangedRanges(diffUrl) {
  const response = await fetch(diffUrl);
  const diffText = await response.text();
  const diff = parseDiff(diffText);
  /** maps files to a list of {from:int, to:int} */
  const changedRanges = {};
  for (const file of diff) {
    const ranges = [];
    for (const c of file.chunks) {
      ranges.push({ start: c.newStart, end: c.newStart + c.newLines });
    }
    changedRanges[file.to] = ranges;
  }
  return changedRanges;
}

async function runJsCpd() {
  let args = {};
  if (fs.existsSync("./.jscpd.json")) {
    let raw = fs.readFileSync("./.jscpd.json");
    args = JSON.parse(raw);
  }
  args.silent = true;
  const result = await detectClones(args);
  for (const e of result) {
    for (const d of [e.duplicationA, e.duplicationB]) {
      d.sourceId = d.sourceId.replace(path.resolve() + "/", "");
    }
  }
  return result;
}

function buildViolations(all, changedRanges) {
  const result = [];
  for (const e of all) {
    const a = e.duplicationA;
    const b = e.duplicationB;
    for (const [us, them] of [
      [a, b],
      [b, a],
    ]) {
      if (!(us.sourceId in changedRanges)) {
        continue;
      }
      let intersects = changedRanges[us.sourceId].some(
        (r) => r.end > us.start.line && r.start < us.end.line
      );
      if (intersects) {
        result.push({ us, them });
      }
    }
  }
  return result;
}

async function main() {
  const payload = JSON.stringify(github.context.payload, undefined, 2);
  const diffUrl = payload.pull_request.diff_url;
  // const diffUrl = "https://github.com/oadam/wordle_solver/commit/34903f7d20c831ea139af606e37646b3cae9a5a7.diff";
  const changedRangesPromise = getChangedRanges(diffUrl);
  const cpdPromise = runJsCpd();
  let changedRanges = await changedRangesPromise;
  let cpd = await cpdPromise;
  const result = buildViolations(cpd, changedRanges);
  for (const r of result) {
    core.notice(
      `see ${r.them.sourceId} (${r.them.start.line}-${r.them.end.line})`,
      {
        title: "Copy/pasted code",
        file: r.us.sourceId,
        startLine: r.us.start.line,
        endLine: r.us.end.line,
      }
    );
  }
}

try {
  main();
} catch (error) {
  core.setFailed(error.message);
}
