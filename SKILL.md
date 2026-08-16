---
name: skills-hub
description: 何时调用我:你需要管理本机 Agent Skill 的库存时——收录新 skill、查某个 skill 的分组与描述、按需启用/撤回它在某个客户端的可见性、软删除不再需要的 skill。只读这一份就能跑通全流程,不需要其他对话。
---

# skills-hub:本机 Agent Skill 统一管理

## 什么时候该调用我

- **收录**:用户说「帮我存一下这个 skill / 这个目录是个 skill」→ 用 adopt 收录进统一库存
- **查询**:想知道库存里有什么、某 skill 的分组与描述 → list / group list / show
- **按需启用**:想让某个 skill 在 Claude/Codex 等客户端可见 → enable
- **撤回**:不想让它再可见(原件保留)→ disable
- **软删除**:确定不要了 → archive(打包进归档区,不真删除)

不需要调用我的场景:只是修改 skill 内容(那是 skill 自身的事,改完可 verify 校验哈希)。

## 前置

CLI 入口:仓库内 node packages/cli/dist/index.js <command>(需先 pnpm build),或全局 bin skills-hub <command>。

> 沙箱规则:任何"真实执行"都在沙箱 home 下做。所有演示命令用 <SANDBOX_HOME> 占位表示沙箱库存根,真实环境先问用户要库存位置。

## 全流程(自包含)

### 1. 初始化库存(一次性)

    skills-hub init --home <SANDBOX_HOME> --yes

### 2. 收录 skill

    skills-hub adopt <本地skill目录路径> --home <SANDBOX_HOME> --yes

重复收录同一内容 → 显示「已存在(内容相同)」并并入来源;同名不同内容 → 冲突,绝不覆盖。

### 3. 看库存与读 description

    skills-hub list --home <SANDBOX_HOME>
    skills-hub show <skill名或哈希前缀> --home <SANDBOX_HOME>

### 4. 查分组与分组操作

    skills-hub group list --home <SANDBOX_HOME>
    skills-hub group add <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group remove <组id> <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub group create <id> [--name 显示名] [--desc 描述] --home <SANDBOX_HOME> --yes
    skills-hub group delete <组id> --home <SANDBOX_HOME> --yes

内置分组:development / design / tooling / writing / research。分组只是视图——删除分组不影响任何 skill。

### 5. 按需启用(挂链接到客户端)

    skills-hub enable <skill名...> --client <claude|codex|...> --home <SANDBOX_HOME> --yes
    skills-hub enable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 6. 撤回(摘链接,原件保留)

    skills-hub disable <skill名...> --client <claude|codex|...> --home <SANDBOX_HOME> --yes
    skills-hub disable --group <组id> --client <claude|codex|...> --home <SANDBOX_HOME> --yes

### 7. 软删除(归档)

    skills-hub archive <skill名...> --home <SANDBOX_HOME> --yes
    skills-hub archive --home <SANDBOX_HOME>   # 列出归档区

归档 = 先摘全部受管链接,再把库存目录打包成 zip 移入归档区,并从库存清单移除。

### 8. 校验与自检

    skills-hub verify --home <SANDBOX_HOME>
    skills-hub doctor --home <SANDBOX_HOME>

## 禁止事项(红线)

- **没有真删除**:archive 是唯一移除方式,且库存原件一个字节不删;disable 只摘链接。任何"彻底删除"只能由用户自己处理归档区文件。
- **写操作必须显式授权**:非交互环境不带 --yes 会被拒绝(exit 2)。不要绕过,也不要替用户想当然。
- **只写沙箱**:除非用户明确指定,库存写操作一律在沙箱 home 验证。
- **不碰客户端目录内容**:enable/disable 只挂/摘链接(junction),绝不移动或修改用户已有目录。

## 机器可读输出

所有命令支持 --json,结构契约见 docs/specs/json-contract-v0.md(成功信封 ok+command,失败信封 ok:false+code+message,退出码 0/1/2)。

## 自测记录

- 2026-08-16:沙箱全流程实测 init → adopt×2 → group list(5 内置)/create/add → enable(2 链接)→ disable(清空)→ rename/delete → archive,全部通过;show/enable 计数正确写入 stats.json;exit 2 路径(重复创建、名+组互斥、空组、缺 --yes)验证通过。
