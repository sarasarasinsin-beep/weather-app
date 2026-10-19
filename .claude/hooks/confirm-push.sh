#!/usr/bin/env bash
# git push の前に、プッシュされるコミットと差分を表示して確認を求める
input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# git push を含まないコマンドは何もしない
if ! printf '%s' "$command" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

# リモートに同名のブランチがあればそれと、なければ main と比べる
if git rev-parse --verify --quiet "origin/$branch" >/dev/null; then
  base="origin/$branch"
else
  base="origin/main"
fi

commits=$(git log --oneline "$base..HEAD" 2>/dev/null)
if [ -z "$commits" ]; then
  commits="(新しいコミットはありません)"
fi
stat=$(git diff --stat "$base...HEAD" 2>/dev/null)
diff=$(git diff "$base...HEAD" 2>/dev/null)

# 長すぎる差分は先頭だけ表示する
max=4000
if [ ${#diff} -gt $max ]; then
  diff="${diff:0:$max}
…(以下省略。全体は ${#diff} 文字)"
fi

reason="プッシュ先: $branch(比較元: $base)

■ コミット
$commits

■ 変更ファイル
$stat

■ 差分
$diff"

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $reason
  }
}'
