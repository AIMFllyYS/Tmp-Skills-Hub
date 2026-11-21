!include "nsDialogs.nsh"

!ifndef BUILD_UNINSTALLER
Var SkillsFolder
Var SkillsInput
Var SkillsHintFile

!macro customPageAfterChangeDir
  Page custom ShowSkillsFolder LeaveSkillsFolder

Function ShowSkillsFolder
  ReadEnvStr $0 "USERPROFILE"
  IfFileExists "$0\.skills-hub\config.json" skip
  ReadEnvStr $1 "APPDATA"
  StrCpy $SkillsHintFile "$1\@skills-hub\desktop\setup-folder.txt"
  IfFileExists "$SkillsHintFile" skip
  StrCmp $SkillsFolder "" 0 display
  StrCpy $SkillsFolder "$0\.skills-hub\skills"
  display:
  !insertmacro MUI_HEADER_TEXT "技能文件夹" "每个受管技能只保存一份，各客户端共用这里的文件。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 10u 100% 15u "技能原文件存在哪里？"
  Pop $0
  ${NSD_CreateDirRequest} 0 31u 78% 14u "$SkillsFolder"
  Pop $SkillsInput
  ${NSD_CreateBrowseButton} 80% 30u 20% 16u "浏览…"
  Pop $0
  ${NSD_OnClick} $0 BrowseSkillsFolder
  ${NSD_CreateLabel} 0 60u 100% 36u "可以保留默认位置，也可以在 D 盘选择一个空文件夹。安装完成后，首次打开 Skills Hub 时会请你确认初始化。"
  Pop $0
  nsDialogs::Show
  Return
  skip:
  Abort
FunctionEnd

Function BrowseSkillsFolder
  Pop $0
  ${NSD_GetText} $SkillsInput $1
  nsDialogs::SelectFolderDialog "选择技能文件夹" "$1"
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $SkillsInput "$0"
  ${EndIf}
FunctionEnd

Function LeaveSkillsFolder
  ${NSD_GetText} $SkillsInput $SkillsFolder
  StrCpy $0 $SkillsFolder
  System::Call 'shlwapi::PathIsRelativeW(w r0)i.r1'
  GetFullPathName $2 "$SkillsFolder"
  System::Call 'shlwapi::PathIsRootW(w r2)i.r3'
  ${If} $SkillsFolder == ""
  ${OrIf} $1 != 0
  ${OrIf} $3 != 0
    MessageBox MB_ICONEXCLAMATION "请填写完整的文件夹路径，例如 D:\My Skills。"
    Abort
  ${EndIf}
  StrCpy $SkillsFolder $2
  System::Call 'shlwapi::PathIsPrefixW(w "$INSTDIR", w r2)i.r3'
  ${If} $3 != 0
    MessageBox MB_ICONEXCLAMATION "请选择程序安装位置以外的文件夹，以便覆盖安装时保留技能原文件。"
    Abort
  ${EndIf}
  IfFileExists "$SkillsFolder" 0 done
  System::Call 'shlwapi::PathIsDirectoryW(w r2)i.r3'
  ${If} $3 == 0
    MessageBox MB_ICONEXCLAMATION "这个路径是一个文件。请选择空文件夹，或填写新文件夹的路径。"
    Abort
  ${EndIf}
  IfFileExists "$SkillsFolder\*.*" 0 done
  FindFirst $0 $1 "$SkillsFolder\*.*"
  loop:
    StrCmp $1 "" close
    StrCmp $1 "." next
    StrCmp $1 ".." next
    FindClose $0
    MessageBox MB_ICONEXCLAMATION "这个文件夹里已经有文件。请选择一个空文件夹，或输入新文件夹的路径。"
    Abort
    next:
    FindNext $0 $1
    Goto loop
  close:
  FindClose $0
  done:
FunctionEnd

!macroend

!macro customInstall
  ${If} $SkillsFolder != ""
    ReadEnvStr $0 "APPDATA"
    CreateDirectory "$0\@skills-hub\desktop"
    ClearErrors
    FileOpen $0 "$SkillsHintFile" w
    ${IfNot} ${Errors}
      FileWriteUTF16LE $0 "$SkillsFolder"
      FileClose $0
    ${EndIf}
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONEXCLAMATION "安装已完成。首次打开时请重新选择技能文件夹。"
    ${EndIf}
  ${EndIf}
!macroend
!endif
