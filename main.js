import core from "@actions/core";
import github from "@actions/github";
import parseDiff from "parse-diff";
import { detectClones } from "jscpd";
import fs from "fs";
import path from "path";
import { Octokit } from "octokit";

async function getChangedRanges(repo, pull_number) {
  const octokit = new Octokit({
    auth: process.env.TOKEN,
  });
  const { data: diffText } = await octokit.rest.pulls.get({
    ...repo,
    pull_number,
    mediaType: {
      format: "diff",
    },
  });
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
        core.debug(`ignoring ${us.sourceId} because not changed by PR`);
        continue;
      }
      let intersects = changedRanges[us.sourceId].some(
        (r) => r.end >= us.start.line && r.start <= us.end.line
      );
      if (intersects) {
        result.push({ us, them });
      } else {
        core.debug(
          `ignoring ${us.sourceId}:${us.start.line}-${us.end.line} because duplication does not intersect changes made by pr`
        );
      }
    }
  }
  return result;
}

async function main() {
  const payload = github.context.payload;
  core.debug(`payload: ${JSON.stringify(payload)}`);

  if (!payload.pull_request) {
    core.setFailed("This action only works on pull_request events");
    return;
  }
  const changedRangesPromise = getChangedRanges(
    github.context.repo,
    payload.pull_request.number
  );
  const cpdPromise = runJsCpd();
  let changedRanges = await changedRangesPromise;
  let cpd = await cpdPromise;
  core.debug(`changedRanges: ${JSON.stringify(changedRanges)}`);
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
  core.notice(
    `repository contains ${cpd.length} duplications.\n${result.length} duplications were part of this PR and were annotated`
  );
}

try {
  main();
} catch (error) {
  core.setFailed(error.message);
}
