import type { UnifiedDiffFile } from "@/components/ui/diff-viewer";
import type { ConflictRecordView } from "@/features/conflicts/types";
import type { GhLoginSession, GitCommitEntry, GitStatusData, SecretFinding } from "@/features/git/types";
import type { ReconcilePreviewData, ReconcileScanSummary } from "@/features/reconcile/types";

export const DEMO_RECONCILE_SUMMARY: ReconcileScanSummary = {
  clientsScanned: 30,
  managedLinks: 286,
  unmanagedRealDirs: 74,
  replacedLinks: 18,
  newConflicts: 6,
  externalSymlinks: 19,
  danglingLinks: 360,
  nonSkillEntries: 4,
  scanDurationMs: 14,
  scannedAt: "2026-11-20T14:20:00.000Z",
};

export const DEMO_RECONCILE_PREVIEW: ReconcilePreviewData = {
  backupRequired: true,
  backupDir: "C:\\Users\\AIMFl\\.skills-hub\\backups",
  skillsRoot: "C:\\Users\\AIMFl\\.skills-hub\\skills",
  toAdopt: [
    {
      skillName: "bilibili-video-production",
      action: "adopt",
      sourceClients: ["antigravity", "codex"],
      hash: "a19d4e8b7c01f93a",
      fileCount: 8,
      totalBytes: 42_600,
    },
    {
      skillName: "gb-standard-docx-pdf",
      action: "adopt",
      sourceClients: ["antigravity"],
      hash: "b82f01c4aa1920fe",
      fileCount: 12,
      totalBytes: 68_400,
    },
    {
      skillName: "code-video-craft",
      action: "adopt",
      sourceClients: ["antigravity", "claude"],
      hash: "c41022ef88a71b23",
      fileCount: 5,
      totalBytes: 24_800,
    },
  ],
  toRelinkIdentical: [
    {
      skillName: "media-use",
      action: "relink-identical",
      sourceClients: ["codex", "claude", "agents"],
      replacesBrokenLink: true,
      hash: "d0914ab81f22e901",
      fileCount: 3,
      totalBytes: 11_200,
    },
  ],
  conflicts: [
    {
      skillName: "hyperframes",
      provisionalWinnerClient: "codex",
      provisionalWinnerVariantId: "e4f82a109c33",
      maxMtimeMs: Date.parse("2026-11-19T09:15:00.000Z"),
      variantCount: 3,
      shorterContentWarning: true,
      involvedClients: ["codex", "claude", "store"],
    },
    {
      skillName: "creating-formal-reports-from-software-products",
      provisionalWinnerClient: "antigravity",
      provisionalWinnerVariantId: "f1209c8a4b11",
      maxMtimeMs: Date.parse("2026-11-18T16:40:00.000Z"),
      variantCount: 2,
      shorterContentWarning: false,
      involvedClients: ["antigravity", "store"],
    },
  ],
  skippedExternalLinks: [
    {
      skillName: "ego-browser",
      clientId: "codex",
      linkPath: "C:\\Users\\AIMFl\\.codex\\skills\\ego-browser",
      targetPath: "C:\\Users\\AIMFl\\.local\\share\\ego\\ego-skills\\ego-browser",
      validSkill: true,
    },
  ],
  untouchedNonSkill: [
    {
      name: ".system",
      clientId: "codex",
      reason: "system-dir",
    },
    {
      name: "draft-unfinished",
      clientId: "claude",
      reason: "incomplete-skill",
    },
  ],
  danglingToPrune: 360,
};

export const DEMO_CONFLICTS: readonly ConflictRecordView[] = [
  {
    skillName: "hyperframes",
    activeHash: "e4f82a109c33a91bc04218a9f2d8871c",
    shorterContentWarning: true,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T14:20:00.000Z",
    variants: [
      {
        variantId: "e4f82a109c33",
        hash: "e4f82a109c33a91bc04218a9f2d8871c",
        sourceClients: ["codex"],
        maxMtimeMs: Date.parse("2026-11-19T09:15:00.000Z"),
        fileCount: 4,
        totalBytes: 14_200,
        detectedAt: "2026-11-20T14:20:00.000Z",
        isActive: true,
      },
      {
        variantId: "91bc44d021ee",
        hash: "91bc44d021ee8390a1448cd09921ff02",
        sourceClients: ["claude", "agents"],
        maxMtimeMs: Date.parse("2026-11-16T18:30:00.000Z"),
        fileCount: 7,
        totalBytes: 28_900,
        detectedAt: "2026-11-20T14:20:00.000Z",
      },
      {
        variantId: "4b10aa778c12",
        hash: "4b10aa778c120188ee72110cc921a098",
        sourceClients: ["store"],
        maxMtimeMs: Date.parse("2026-08-19T08:04:00.000Z"),
        fileCount: 5,
        totalBytes: 19_400,
        detectedAt: "2026-11-20T14:20:00.000Z",
      },
    ],
  },
  {
    skillName: "creating-formal-reports-from-software-products",
    activeHash: "f1209c8a4b1177ab9012334455667788",
    shorterContentWarning: false,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T14:20:00.000Z",
    variants: [
      {
        variantId: "f1209c8a4b11",
        hash: "f1209c8a4b1177ab9012334455667788",
        sourceClients: ["antigravity"],
        maxMtimeMs: Date.parse("2026-11-18T16:40:00.000Z"),
        fileCount: 6,
        totalBytes: 31_400,
        detectedAt: "2026-11-20T14:20:00.000Z",
        isActive: true,
      },
      {
        variantId: "7a01e2b99044",
        hash: "7a01e2b990448811bb22cc33dd44ee55",
        sourceClients: ["store"],
        maxMtimeMs: Date.parse("2026-08-18T11:20:00.000Z"),
        fileCount: 4,
        totalBytes: 18_200,
        detectedAt: "2026-11-20T14:20:00.000Z",
      },
    ],
  },
];

export const DEMO_CONFLICT_DIFFS: Record<string, readonly UnifiedDiffFile[]> = {
  "91bc44d021ee": [
    {
      relPath: "SKILL.md",
      status: "modified",
      hunks: [
        {
          header: "@@ -12,5 +12,9 @@",
          lines: [
            { kind: "context", oldLine: 12, newLine: 12, text: "## 渲染参数" },
            { kind: "del", oldLine: 13, text: "- 默认帧率 30fps" },
            { kind: "add", newLine: 13, text: "- 默认帧率 60fps（支持 1080p 与 720p 双规格编码）" },
            { kind: "add", newLine: 14, text: "- Windows PowerShell 禁止使用 && 串联 FFmpeg 命令" },
            { kind: "context", oldLine: 14, newLine: 15, text: "- 输出前执行对称像素质检" },
          ],
        },
      ],
    },
    {
      relPath: "scripts/verify-frames.mjs",
      status: "added",
      hunks: [
        {
          header: "@@ -0,0 +1,3 @@",
          lines: [
            { kind: "add", newLine: 1, text: "export function checkFrameBudget(frames) {" },
            { kind: "add", newLine: 2, text: "  return frames.every((f) => f.dropped === 0);" },
            { kind: "add", newLine: 3, text: "}" },
          ],
        },
      ],
    },
  ],
  "4b10aa778c12": [
    {
      relPath: "SKILL.md",
      status: "modified",
      hunks: [
        {
          header: "@@ -1,4 +1,4 @@",
          lines: [
            { kind: "context", oldLine: 1, newLine: 1, text: "---" },
            { kind: "del", oldLine: 2, text: "description: Legacy August hyperframes workflow" },
            { kind: "add", newLine: 2, text: "description: Updated November hyperframes workflow" },
            { kind: "context", oldLine: 3, newLine: 3, text: "---" },
          ],
        },
      ],
    },
  ],
  "7a01e2b99044": [
    {
      relPath: "SKILL.md",
      status: "modified",
      hunks: [
        {
          header: "@@ -22,3 +22,6 @@",
          lines: [
            { kind: "context", oldLine: 22, newLine: 22, text: "## 截图规范" },
            { kind: "add", newLine: 23, text: "- 必须包含真实运行态产品截图，禁止示意线框替代" },
            { kind: "add", newLine: 24, text: "- DOCX 与 PDF 双版本保持 WPS / Word 兼容排版" },
          ],
        },
      ],
    },
  ],
};

export const DEMO_GIT_STATUS_PRESETS: Record<"connected" | "no-git" | "diverged", GitStatusData> = {
  connected: {
    enabled: true,
    gitInstalled: true,
    gitVersion: "2.47.1.windows.1",
    ghInstalled: true,
    ghVersion: "2.63.0",
    ghAuthenticated: true,
    ghUsername: "AIMFllyYS",
    initialized: true,
    branch: "main",
    remoteUrl: "https://github.com/AIMFllyYS/my-skills-hub-backup",
    aheadCount: 3,
    dirtyCount: 0,
    remoteDiverged: false,
  },
  "no-git": {
    enabled: false,
    gitInstalled: false,
    gitVersion: null,
    ghInstalled: false,
    ghVersion: null,
    ghAuthenticated: false,
    ghUsername: null,
    initialized: false,
  },
  diverged: {
    enabled: true,
    gitInstalled: true,
    gitVersion: "2.47.1.windows.1",
    ghInstalled: true,
    ghVersion: "2.63.0",
    ghAuthenticated: true,
    ghUsername: "AIMFllyYS",
    initialized: true,
    branch: "main",
    remoteUrl: "https://github.com/AIMFllyYS/my-skills-hub-backup",
    aheadCount: 2,
    dirtyCount: 0,
    remoteDiverged: true,
  },
};

export const DEMO_GH_LOGIN_PENDING: GhLoginSession = {
  sessionId: "demo-gh-session-1",
  userCode: "A4K9-M2P7",
  verificationUrl: "https://github.com/login/device",
  status: "pending",
};

export const DEMO_SECRET_FINDINGS: readonly SecretFinding[] = [
  {
    file: "skills/vps-init/scripts/deploy.ps1",
    line: 14,
    preview: "GITHUB_TOKEN=ghp_7xK9************",
    rule: "github-pat",
  },
  {
    file: "skills/xhs-automation/config.example.env",
    line: 3,
    preview: "QINIU_API_KEY=sk-qiniu-************",
    rule: "api-key-assignment",
  },
];

export const DEMO_COMMITS: readonly GitCommitEntry[] = [
  {
    hash: "8a91f02b4410ce77",
    shortHash: "8a91f02",
    timestamp: "2026-11-20T13:15:00.000Z",
    author: "Skills Hub",
    message: "feat(skill): merge codex and claude variants for hyperframes",
    filesChanged: 2,
    insertions: 18,
    deletions: 4,
  },
  {
    hash: "3c11d90811aa42ef",
    shortHash: "3c11d90",
    timestamp: "2026-11-19T09:15:00.000Z",
    author: "Codex Agent",
    message: "docs(skill): record Windows NTFS junction edge cases in hyperframes",
    filesChanged: 1,
    insertions: 9,
    deletions: 1,
  },
  {
    hash: "0f84aa1290b33e01",
    shortHash: "0f84aa1",
    timestamp: "2026-08-19T08:04:00.000Z",
    author: "Skills Hub",
    message: "chore(skills): initialize single-source repository",
    filesChanged: 5,
    insertions: 214,
    deletions: 0,
  },
];

export const DEMO_COMMIT_DIFF: readonly UnifiedDiffFile[] = [
  {
    relPath: "SKILL.md",
    status: "modified",
    hunks: [
      {
        header: "@@ -8,4 +8,6 @@",
        lines: [
          { kind: "context", oldLine: 8, newLine: 8, text: "## 核心规则" },
          { kind: "del", oldLine: 9, text: "- 旧版导出参数" },
          { kind: "add", newLine: 9, text: "- 合并 Codex 与 Claude 双方实战规则，统一 60fps 与双规格导出" },
          { kind: "add", newLine: 10, text: "- 新增 Windows 路径转义与防清空软链内容提醒" },
        ],
      },
    ],
  },
];
