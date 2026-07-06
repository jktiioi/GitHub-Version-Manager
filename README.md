# GitHub Version Manager

中文 | [English](#english)

这是一个本地运行的小工具，用来管理一个文件夹和 GitHub 仓库之间的版本。

它主要做三件事：

- 把当前文件夹推送到 GitHub，保存成一个新版本
- 显示 GitHub 上已有的版本历史
- 选择一个 GitHub 版本，把本地文件夹恢复到那个版本

## 启动软件

双击：

```text
start.bat
```

然后在浏览器打开：

```text
http://127.0.0.1:7788
```

如果想手动启动，也可以在这个文件夹运行：

```bash
npm start
```

## 关闭软件

双击：

```text
stop.bat
```

## 第一次使用

打开页面后，先点右上角的设置按钮。

填写这些内容：

- 当前文件夹：选择你要管理的本地项目文件夹
- GitHub 仓库地址：例如 `https://github.com/用户名/仓库名`
- 你的名字：用于 Git 提交记录
- 你的邮箱：用于 Git 提交记录

填好后点击：

```text
保存设置
```

如果这个文件夹还不是 Git 仓库，软件会自动初始化 Git。

保存设置后，右侧“GitHub 版本历史”会开始连接 GitHub 并加载历史版本。

如果看到“正在加载 GitHub 版本历史”，说明软件正在读取 GitHub 数据。网络慢时可能需要等几秒钟。

## 推送当前版本

当你修改了本地文件后：

1. 在“版本说明”里写一句说明
2. 点击“推送当前版本”
3. 软件会把当前文件夹保存成一个 GitHub 新版本

注意：推送会上传当前文件夹里被 Git 管理的文件。

## 恢复到 GitHub 上的某个版本

在“GitHub 版本历史”里选择一个版本，然后点击：

```text
恢复本地到这里
```

软件会把本地文件夹恢复成 GitHub 上那个版本的内容。

这个操作会清理本地未保存的修改，但不会修改 GitHub 上的历史版本。

如果当前文件夹还没有本地版本，每个历史版本会显示“获取到本地”。你可以选择任意一个版本获取到本地。

## 从 GitHub 获取文件到本地

如果当前文件夹还没有本地版本，版本历史里的版本会显示：

```text
获取到本地
```

点击后，软件会把你选择的 GitHub 版本下载到当前文件夹。

## 分支

一般新手不用改分支，使用默认分支即可。

如果你确实需要，也可以在设置里：

- 切换已有分支
- 新建并切换到一个新分支

## 信息会保存在哪里

软件只在本地保存设置。

保存位置：

```text
D:\git软件\data\config.json
```

这里保存的是：

- 当前文件夹路径
- GitHub 仓库地址

你的名字和邮箱不会保存到这个软件的配置文件里。它们会写入所选项目自己的 Git 配置，用于提交记录。

---

## English

GitHub Version Manager is a small local tool for managing versions between a local folder and a GitHub repository.

It mainly helps you:

- Push the current folder to GitHub as a new version
- View version history from GitHub
- Restore the local folder to any GitHub version

## Start

Double-click:

```text
start.bat
```

Then open this address in your browser:

```text
http://127.0.0.1:7788
```

You can also start it manually in this folder:

```bash
npm start
```

## Stop

Double-click:

```text
stop.bat
```

## First Use

Open the page and click the settings button in the upper right.

Fill in:

- Current folder: the local project folder you want to manage
- GitHub repository URL: for example `https://github.com/username/repository`
- Your name: used in Git commit records
- Your email: used in Git commit records

Then click:

```text
Save settings
```

If the folder is not a Git repository yet, the app will initialize Git automatically.

After saving settings, the GitHub Version History panel will connect to GitHub and load versions.

If you see “Loading GitHub version history”, the app is reading GitHub data. Slow networks may take a few seconds.

## Push Current Version

After changing local files:

1. Write a short version note
2. Click “Push current version”
3. The app saves the current folder as a new GitHub version

Note: pushing uploads files that are tracked by Git in the current folder.

## Restore a GitHub Version

In “GitHub Version History”, choose a version and click:

```text
Restore local here
```

The app will restore the local folder to the selected GitHub version.

This clears unsaved local changes, but it does not modify GitHub history.

If the current folder has no local version yet, each history item will show “Get locally”. You can choose any version to get locally.

## Get GitHub Files Locally

If the current folder has no local version yet, history items will show:

```text
Get locally
```

Click it to download the selected GitHub version into the current folder.

## Branches

New users usually do not need to change branches. Use the default branch.

If needed, settings also allow you to:

- Switch to an existing branch
- Create and switch to a new branch

## Where Settings Are Saved

The app stores settings locally only.

Location:

```text
D:\git软件\data\config.json
```

It stores:

- Current folder path
- GitHub repository URL

Your name and email are not saved in this app config file. They are written to the selected project’s local Git config for commit records.


