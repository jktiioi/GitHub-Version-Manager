import { spawn } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const configPath = path.join(dataDir, "config.json");
const port = Number(process.env.PORT || 7788);

const defaultConfig = {
  folderPath: "D:\\VBTEA\\VBTea",
  repoUrl: "",
};

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultConfig,
      folderPath: parsed.folderPath || defaultConfig.folderPath,
      repoUrl: parsed.repoUrl || defaultConfig.repoUrl,
    };
  } catch {
    return defaultConfig;
  }
}

async function writeConfig(config) {
  await ensureDataDir();
  const savedConfig = {
    folderPath: config.folderPath || "",
    repoUrl: config.repoUrl || "",
  };
  await fs.writeFile(configPath, JSON.stringify(savedConfig, null, 2), "utf8");
}

function isSafeFolder(folderPath) {
  if (!folderPath || typeof folderPath !== "string") return false;
  const resolved = path.resolve(folderPath);
  const root = path.parse(resolved).root;
  return resolved !== root && existsSync(resolved);
}

function runGit(args, cwd, timeoutMs = 45000) {
  return new Promise((resolve) => {
    let finished = false;
    let timedOut = false;
    const child = spawn("git", args, {
      cwd,
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout: stdout.trim(),
        stderr: timedOut ? "Git 命令执行超时，请检查网络或 GitHub 地址。" : stderr.trim(),
      });
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        stdout: "",
        stderr: error.message,
      });
    });
  });
}

async function git(args, cwd, timeoutMs) {
  const result = await runGit(args, cwd, timeoutMs);
  if (!result.ok) {
    const command = `git ${args.join(" ")}`;
    const message = result.stderr || result.stdout || "Git 命令执行失败";
    throw new Error(`${command}\n${message}`);
  }
  return result.stdout;
}

async function getActiveConfig() {
  const config = await readConfig();
  if (!isSafeFolder(config.folderPath)) {
    throw new Error("当前文件夹不存在，请先在设置里填写正确路径。");
  }
  return config;
}

async function getGitDefaults() {
  const gitVersion = await runGit(["--version"], process.cwd());
  const globalUserName = await runGit(["config", "--global", "user.name"], process.cwd());
  const globalUserEmail = await runGit(["config", "--global", "user.email"], process.cwd());

  return {
    gitInstalled: gitVersion.ok,
    gitVersion: gitVersion.stdout,
    userName: globalUserName.stdout,
    userEmail: globalUserEmail.stdout,
  };
}

function buildSetupChecks({ gitInstalled, folderExists, repoUrl, userName, userEmail }) {
  const items = [
    {
      key: "git",
      ok: gitInstalled,
      label: "Git 已安装",
      help: gitInstalled ? "本机可以执行 Git 命令。" : "需要先安装 Git for Windows。",
    },
    {
      key: "folder",
      ok: folderExists,
      label: "当前文件夹",
      help: folderExists ? "已选择可用文件夹。" : "请选择本地项目文件夹。",
    },
    {
      key: "remote",
      ok: Boolean(repoUrl),
      label: "GitHub 仓库地址",
      help: repoUrl ? "已连接远程仓库地址。" : "请填写 GitHub 仓库地址。",
    },
    {
      key: "author",
      ok: Boolean(userName && userEmail),
      label: "提交作者信息",
      help: userName && userEmail ? "提交时会使用当前作者信息。" : "请填写名字和邮箱，或先配置本机 Git 默认作者。",
    },
  ];

  return {
    complete: items.every((item) => item.ok),
    items,
  };
}

async function getCurrentBranch(cwd) {
  const branch = await runGit(["branch", "--show-current"], cwd);
  return branch.stdout || "";
}

async function assertValidBranchName(name) {
  if (!name) throw new Error("请填写分支名称。");
  const result = await runGit(["check-ref-format", "--branch", name], process.cwd());
  if (!result.ok) throw new Error("分支名称不正确。");
}

async function getRemoteDefaultBranch(cwd) {
  const head = await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd);
  if (head.ok && head.stdout) return head.stdout.replace(/^origin\//, "");

  const remote = await runGit(["branch", "-r", "--format=%(refname:short)"], cwd);
  const branch = remote.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((name) => name.includes("/"))
    .filter((name) => !name.endsWith("/HEAD"))
    .map((name) => name.replace(/^origin\//, ""))[0];

  return branch || "";
}

async function getDisplayBranch(cwd) {
  const localBranch = await getCurrentBranch(cwd);
  const hasHead = await runGit(["rev-parse", "--verify", "HEAD"], cwd);
  if (hasHead.ok) {
    return {
      branch: localBranch,
      hasHead: true,
    };
  }

  const defaultBranch = await getRemoteDefaultBranch(cwd);
  return {
    branch: defaultBranch || localBranch,
    hasHead: false,
  };
}

async function getStatus() {
  const config = await readConfig();
  const gitDefaults = await getGitDefaults();
  if (!isSafeFolder(config.folderPath)) {
    const setup = buildSetupChecks({
      gitInstalled: gitDefaults.gitInstalled,
      folderExists: false,
      repoUrl: config.repoUrl,
      userName: gitDefaults.userName,
      userEmail: gitDefaults.userEmail,
      branch: "",
    });
    return {
      config: {
        ...config,
        userName: gitDefaults.userName,
        userEmail: gitDefaults.userEmail,
      },
      connected: false,
      branch: "",
      changes: [],
      currentHash: "",
      remote: config.repoUrl,
      message: "请先连接一个本地文件夹。",
      setup,
    };
  }

  const cwd = config.folderPath;
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok) {
    const setup = buildSetupChecks({
      gitInstalled: gitDefaults.gitInstalled,
      folderExists: true,
      repoUrl: config.repoUrl,
      userName: gitDefaults.userName,
      userEmail: gitDefaults.userEmail,
      branch: "",
    });
    return {
      config: {
        ...config,
        userName: gitDefaults.userName,
        userEmail: gitDefaults.userEmail,
      },
      connected: false,
      branch: "",
      changes: [],
      currentHash: "",
      remote: config.repoUrl,
      message: "这个文件夹还没有初始化 Git。",
      setup,
    };
  }

  const remote = await runGit(["remote", "get-url", "origin"], cwd);
  const branchInfo = await getDisplayBranch(cwd);
  const branch = branchInfo.branch;
  const localUserName = await runGit(["config", "user.name"], cwd);
  const localUserEmail = await runGit(["config", "user.email"], cwd);
  const globalUserName = await runGit(["config", "--global", "user.name"], cwd);
  const globalUserEmail = await runGit(["config", "--global", "user.email"], cwd);
  const resolvedUserName = localUserName.stdout || globalUserName.stdout;
  const resolvedUserEmail = localUserEmail.stdout || globalUserEmail.stdout;
  const status = await runGit(["-c", "core.quotepath=false", "status", "--short"], cwd);
  const currentHash = await runGit(["rev-parse", "--short", "HEAD"], cwd);
  const changes = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim() || "修改",
      path: line.slice(2).trim(),
    }));

  const setup = buildSetupChecks({
    gitInstalled: gitDefaults.gitInstalled,
    folderExists: true,
    repoUrl: remote.stdout || config.repoUrl,
    userName: resolvedUserName,
    userEmail: resolvedUserEmail,
    branch,
  });

  return {
    config: {
      ...config,
      branch,
      repoUrl: remote.stdout || config.repoUrl,
      userName: resolvedUserName,
      userEmail: resolvedUserEmail,
    },
    connected: true,
    branch,
    changes,
    currentHash: currentHash.ok ? currentHash.stdout : "",
    remote: remote.stdout || config.repoUrl,
    message: changes.length
      ? `检测到 ${changes.length} 个本地修改。`
      : "本地没有未保存修改。",
    setup,
  };
}

async function setupRepository(payload) {
  const config = {
    folderPath: String(payload.folderPath || "").trim(),
    repoUrl: String(payload.repoUrl || "").trim(),
  };
  const userName = String(payload.userName || "").trim();
  const userEmail = String(payload.userEmail || "").trim();

  if (!isSafeFolder(config.folderPath)) {
    throw new Error("当前文件夹不存在，不能初始化。");
  }
  if (!config.repoUrl) throw new Error("请填写 GitHub 仓库地址。");

  const cwd = config.folderPath;
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok) {
    await git(["init"], cwd);
  }

  const existingUserName = await runGit(["config", "user.name"], cwd);
  const existingUserEmail = await runGit(["config", "user.email"], cwd);
  const globalUserName = await runGit(["config", "--global", "user.name"], cwd);
  const globalUserEmail = await runGit(["config", "--global", "user.email"], cwd);
  const needsUserName = !(existingUserName.stdout || globalUserName.stdout);
  const needsUserEmail = !(existingUserEmail.stdout || globalUserEmail.stdout);

  if (needsUserName && !userName) throw new Error("请填写你的名字，用于 Git 提交记录。");
  if (needsUserEmail && !userEmail) throw new Error("请填写你的邮箱，用于 Git 提交记录。");

  if (userName && userName !== existingUserName.stdout) await git(["config", "user.name", userName], cwd);
  if (userEmail && userEmail !== existingUserEmail.stdout) await git(["config", "user.email", userEmail], cwd);

  const remote = await runGit(["remote", "get-url", "origin"], cwd);
  if (remote.ok) {
    await git(["remote", "set-url", "origin", config.repoUrl], cwd);
  } else {
    await git(["remote", "add", "origin", config.repoUrl], cwd);
  }
  await writeConfig(config);
  return getStatus();
}

async function previewSetup(payload) {
  const folderPath = String(payload.folderPath || "").trim();
  const repoUrl = String(payload.repoUrl || "").trim();
  const formUserName = String(payload.userName || "").trim();
  const formUserEmail = String(payload.userEmail || "").trim();
  const gitDefaults = await getGitDefaults();
  const folderExists = isSafeFolder(folderPath);
  let resolvedUserName = formUserName || gitDefaults.userName;
  let resolvedUserEmail = formUserEmail || gitDefaults.userEmail;

  if (folderExists) {
    const localUserName = await runGit(["config", "user.name"], folderPath);
    const localUserEmail = await runGit(["config", "user.email"], folderPath);
    resolvedUserName = formUserName || localUserName.stdout || gitDefaults.userName;
    resolvedUserEmail = formUserEmail || localUserEmail.stdout || gitDefaults.userEmail;
  }

  return {
    setup: buildSetupChecks({
      gitInstalled: gitDefaults.gitInstalled,
      folderExists,
      repoUrl,
      userName: resolvedUserName,
      userEmail: resolvedUserEmail,
    }),
  };
}

async function listBranches() {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok) throw new Error("这个文件夹还没有初始化 Git。");

  await runGit(["fetch", "origin"], cwd);
  const branchInfo = await getDisplayBranch(cwd);
  const current = branchInfo.branch;
  const local = await runGit(["branch", "--format=%(refname:short)"], cwd);
  const remote = await runGit(["branch", "-r", "--format=%(refname:short)"], cwd);
  const localNames = new Set(local.stdout.split(/\r?\n/).filter(Boolean));
  const remoteNames = new Set(
    remote.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((name) => name.includes("/"))
      .filter((name) => !name.endsWith("/HEAD"))
      .map((name) => name.replace(/^origin\//, "")),
  );
  const names = [...new Set([...localNames, ...remoteNames, current].filter(Boolean))].sort((a, b) => {
    if (a === current) return -1;
    if (b === current) return 1;
    return a.localeCompare(b, "zh-Hans-CN");
  });

  return {
    current,
    branches: names.map((name) => ({
      name,
      current: name === current,
      local: localNames.has(name),
      remote: remoteNames.has(name),
    })),
  };
}

async function switchBranch(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const branchName = String(payload.branchName || "").trim();
  await assertValidBranchName(branchName);

  const branches = await listBranches();
  const target = branches.branches.find((branch) => branch.name === branchName);
  if (!target) throw new Error("没有找到这个分支。");

  if (target.local) {
    await git(["switch", branchName], cwd);
  } else if (target.remote) {
    await git(["switch", "--track", `origin/${branchName}`], cwd);
  }

  return {
    ...(await getStatus()),
    branches: await listBranches(),
  };
}

async function createBranch(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const branchName = String(payload.branchName || "").trim();
  await assertValidBranchName(branchName);

  const branches = await listBranches();
  if (branches.branches.some((branch) => branch.name === branchName)) {
    throw new Error("这个分支已经存在。");
  }

  await git(["switch", "-c", branchName], cwd);
  return {
    ...(await getStatus()),
    branches: await listBranches(),
  };
}

async function mergeBranch(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const branchName = String(payload.branchName || "").trim();
  await assertValidBranchName(branchName);

  const dirty = await runGit(["-c", "core.quotepath=false", "status", "--porcelain"], cwd);
  if (dirty.stdout) {
    throw new Error("合并分支前请先推送、恢复或清理本地修改，避免覆盖当前文件。");
  }

  const branches = await listBranches();
  const target = branches.branches.find((branch) => branch.name === branchName);
  if (!target) throw new Error("没有找到这个分支。");
  if (target.current) throw new Error("不能把当前分支合并到自己。");

  const sourceRef = target.local ? branchName : `origin/${branchName}`;
  const result = await runGit(["merge", "--no-edit", sourceRef], cwd, 120000);
  if (!result.ok) {
    await runGit(["merge", "--abort"], cwd);
    throw new Error("合并失败，可能存在文件冲突。请先处理冲突，或换一个旁支再试。");
  }

  return {
    ...(await getStatus()),
    branches: await listBranches(),
    mergeMessage: `已把 ${branchName} 合并到当前分支。`,
  };
}

async function deleteBranch(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const branchName = String(payload.branchName || "").trim();
  await assertValidBranchName(branchName);

  const branches = await listBranches();
  const target = branches.branches.find((branch) => branch.name === branchName);
  if (!target) throw new Error("没有找到这个分支。");
  if (target.current) throw new Error("不能删除当前正在使用的分支。");
  if (["main", "master"].includes(branchName)) throw new Error("不能删除主分支。");
  if (!target.local) throw new Error("这里只能删除本地旁支，GitHub 上的远程旁支不会被删除。");

  const result = await runGit(["branch", "-d", branchName], cwd);
  if (!result.ok) {
    throw new Error("删除失败。这个旁支可能还没有合并，Git 已阻止删除。");
  }

  return {
    ...(await getStatus()),
    branches: await listBranches(),
    deleteMessage: `已删除本地旁支 ${branchName}。`,
  };
}

function getWindowsRoots() {
  const roots = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    if (existsSync(root)) roots.push(root);
  }
  return roots;
}

async function listFolders(payload) {
  const roots = getWindowsRoots();
  const requestedPath = String(payload.folderPath || "").trim();
  let currentPath = requestedPath && existsSync(requestedPath) ? path.resolve(requestedPath) : roots[0] || "C:\\";

  const stat = await fs.stat(currentPath).catch(() => null);
  if (!stat?.isDirectory()) {
    currentPath = path.dirname(currentPath);
  }

  const parentPath = path.dirname(currentPath) === currentPath ? "" : path.dirname(currentPath);
  const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  return {
    currentPath,
    parentPath,
    roots,
    folders,
  };
}

async function createFolder(payload) {
  const currentPath = String(payload.currentPath || "").trim();
  const folderName = String(payload.folderName || "").trim();

  if (!currentPath || !existsSync(currentPath)) {
    throw new Error("当前路径不存在。");
  }
  if (!folderName) {
    throw new Error("请输入新文件夹名称。");
  }
  if (folderName === "." || folderName === ".." || /[<>:"/\\|?*]/.test(folderName)) {
    throw new Error("文件夹名称包含 Windows 不允许的字符。");
  }

  const targetPath = path.join(currentPath, folderName);
  if (existsSync(targetPath)) {
    throw new Error("这个文件夹已经存在。");
  }

  await fs.mkdir(targetPath);
  return listFolders({ folderPath: targetPath });
}

async function pushVersion(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const branch = await getCurrentBranch(cwd);
  const message = String(payload.message || "").trim();
  if (!message) throw new Error("请填写版本说明。");
  if (!branch) throw new Error("当前没有可推送的分支。");
  const userName = await runGit(["config", "user.name"], cwd);
  const userEmail = await runGit(["config", "user.email"], cwd);
  const globalUserName = await runGit(["config", "--global", "user.name"], cwd);
  const globalUserEmail = await runGit(["config", "--global", "user.email"], cwd);
  if (!(userName.stdout || globalUserName.stdout) || !(userEmail.stdout || globalUserEmail.stdout)) {
    throw new Error("提交作者信息还没设置。请在设置里填写你的名字和邮箱，然后保存连接设置。");
  }

  await git(["add", "."], cwd);
  const diff = await runGit(["diff", "--cached", "--quiet"], cwd);
  if (diff.code === 0) {
    return {
      ...(await getStatus()),
      pushed: false,
      pushMessage: "没有新的修改需要推送。",
    };
  }

  await git(["commit", "-m", message], cwd);
  await git(["push", "-u", "origin", branch], cwd, 120000);
  const hash = await git(["rev-parse", "--short", "HEAD"], cwd);
  return {
    ...(await getStatus()),
    pushed: true,
    pushMessage: `推送成功，GitHub 已保存版本 ${hash}。`,
  };
}

async function getVersions() {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  await git(["fetch", "origin"], cwd);

  const branch = await getCurrentBranch(cwd);
  if (!branch) throw new Error("当前没有可读取的分支。");
  const currentHash = await runGit(["rev-parse", "HEAD"], cwd);
  const currentHashValue = currentHash.ok ? currentHash.stdout : "";
  const currentRemoteRef = `origin/${branch}`;
  const currentRemoteExists = await runGit(["rev-parse", "--verify", currentRemoteRef], cwd);
  let ref = currentRemoteExists.ok ? currentRemoteRef : branch;

  if (!currentHash.ok && !currentRemoteExists.ok) {
    const defaultBranch = await getRemoteDefaultBranch(cwd);
    if (defaultBranch) {
      ref = `origin/${defaultBranch}`;
    }
  }

  const log = await runGit(
    ["log", ref, "--max-count=50", "--pretty=format:%h%x1f%H%x1f%s%x1f%an%x1f%ad", "--date=format:%Y-%m-%d %H:%M"],
    cwd,
  );
  if (!log.ok) {
    return { versions: [], currentHash: "" };
  }

  const versions = log.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [shortHash, hash, title, author, time] = line.split("\x1f");
      return {
        shortHash,
        hash,
        title,
        author,
        time,
        current: hash === currentHashValue,
      };
    });

  return { versions, currentHash: currentHashValue };
}

async function downloadLatest() {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  if (!inside.ok) throw new Error("这个文件夹还没有初始化 Git，请先补全并保存设置。");

  const remote = await runGit(["remote", "get-url", "origin"], cwd);
  if (!remote.ok) throw new Error("请先填写 GitHub 仓库地址并保存设置。");

  const dirty = await runGit(["-c", "core.quotepath=false", "status", "--porcelain"], cwd);
  if (dirty.stdout) {
    throw new Error("当前文件夹有本地修改。请先推送、清理，或选择一个 GitHub 版本恢复，避免覆盖本地文件。");
  }

  await git(["fetch", "origin"], cwd);
  const branch = await getRemoteDefaultBranch(cwd);
  if (!branch) throw new Error("没有找到 GitHub 远程分支。");

  const remoteRef = `origin/${branch}`;
  const remoteExists = await runGit(["rev-parse", "--verify", remoteRef], cwd);
  if (!remoteExists.ok) throw new Error(`GitHub 上没有找到 ${branch} 分支。`);

  const hasHead = await runGit(["rev-parse", "--verify", "HEAD"], cwd);
  const localBranch = await runGit(["show-ref", "--verify", `refs/heads/${branch}`], cwd);
  const currentBranch = await getCurrentBranch(cwd);

  if (!hasHead.ok) {
    await git(["checkout", "-B", branch, remoteRef], cwd);
  } else if (currentBranch !== branch) {
    if (localBranch.ok) {
      await git(["switch", branch], cwd);
    } else {
      await git(["switch", "--track", remoteRef], cwd);
    }
    await git(["pull", "--ff-only", "origin", branch], cwd);
  } else {
    await git(["pull", "--ff-only", "origin", branch], cwd);
  }

  return {
    ...(await getStatus()),
    branches: await listBranches(),
    versions: await getVersions(),
    downloadMessage: `已从 GitHub 获取 ${branch} 分支的最新文件。`,
  };
}

async function restoreVersion(payload) {
  const config = await getActiveConfig();
  const cwd = config.folderPath;
  const hash = String(payload.hash || "").trim();
  if (!/^[a-f0-9]{7,40}$/i.test(hash)) throw new Error("版本号不正确。");

  await git(["fetch", "origin"], cwd);
  const beforeHash = await runGit(["rev-parse", "HEAD"], cwd);
  await git(["reset", "--hard", hash], cwd);
  await git(["clean", "-fd"], cwd);
  const cleanedCurrent = beforeHash.ok && beforeHash.stdout.toLowerCase() === hash.toLowerCase();

  return {
    ...(await getStatus()),
    restored: true,
    restoreMessage: cleanedCurrent
      ? `已清理本地修改，并重新使用 ${hash.slice(0, 7)}。`
      : `已恢复本地文件夹到 ${hash.slice(0, 7)}。`,
  };
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const routes = {
  "GET /api/status": getStatus,
  "GET /api/versions": getVersions,
  "GET /api/branches": listBranches,
  "POST /api/check-setup": previewSetup,
  "POST /api/setup": setupRepository,
  "POST /api/download-latest": downloadLatest,
  "POST /api/switch-branch": switchBranch,
  "POST /api/create-branch": createBranch,
  "POST /api/merge-branch": mergeBranch,
  "POST /api/delete-branch": deleteBranch,
  "POST /api/folders": listFolders,
  "POST /api/create-folder": createFolder,
  "POST /api/push": pushVersion,
  "POST /api/restore": restoreVersion,
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];

  if (!handler) {
    await serveStatic(req, res);
    return;
  }

  try {
    const payload = req.method === "POST" ? await readJson(req) : {};
    const data = await handler(payload);
    sendJson(res, 200, { ok: true, data });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`GitHub 版本管家已启动：http://127.0.0.1:${port}`);
});
