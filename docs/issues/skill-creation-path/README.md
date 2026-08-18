# docs/issues/skill-creation-path/

「用户在客户端里**新建** skill」这条路径的分析与追踪。

## 为什么单开一个文件夹

`#162`–`#165` 解决的是「客户端里多出来的 skill 怎么捞回来」（事后），`#168` 解决的是「捞回来的东西怎么分类」。
这两者共同的上游问题——**架构里从来没有定义过「创建」这个操作**——不属于任何一个既有 issue，也不适合塞进 backlog 一行了事，所以单开一处集中记录。

## 文档 ↔ 云端 issue 双向标记

本地文档与 GitHub issue 一一对照，两边都要写对方的地址；任何一侧变更，另一侧同步。

| 本地文档 | 云端 issue | 状态 |
|---|---|---|
| [creation-path-analysis.md](./creation-path-analysis.md) | [#169](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/169) | 分析稿完成，决策点待人勾选 |

## 相关但不在本文件夹

- [#162](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/162) 归拢后客户端新建 skill 无法进入统一管理（事后兜底，父 issue）
- [#168](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/168) 官方与插件 skill 的收录边界和跨客户端启用（分类口径）
- [#166](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/166) 链接变更后各 IDE 能否不重启即看见（决定「建完能不能马上用」）
