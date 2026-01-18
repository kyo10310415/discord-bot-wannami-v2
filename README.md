# Discord Bot for わなみさん v16.0.0

VTuber育成スクール用Discord自動応答チャットボット - Q&A自動生成・週次配信機能付き完全版

## 🆕 Version 16.0.0 新機能

### Q&A自動生成システム
- **ランダム質問生成**: 知識ベースから自動的にQ&Aペアを生成
- **30個サンプル管理**: 「回答サンプル」シートに最大30個のQ&Aを保存
- **自動補充機能**: 毎日深夜2時に不足分を自動生成

### 週次Discord Webhook送信
- **毎週火曜日18時自動送信**: アクティブ会員全員に質問例と回答例を配信
- **ランダム選択**: 30個のサンプルから毎週異なるQ&Aを送信
- **使用済み管理**: 30個すべて使用後は自動リセットして再利用

### 定期実行スケジューラー
- **週次タスク**: 毎週火曜日 18:00 (JST)
- **日次チェック**: 毎日 2:00 (JST) - Q&Aサンプル自動補充

---

## 📋 システム構成

### 既存機能
- ✅ Discord Gateway接続
- ✅ Discord Interactions API
- ✅ @わなみさんメンション対応（AI統合）
- ✅ /soudanスラッシュコマンド
- ✅ AI知識ベース統合（スプレッドシートA-G列対応）
- ✅ 画像検出・抽出・Vision解析機能
- ✅ RAGシステム（OpenAI統合）
- ✅ Notion/WEBサイト読み込み
- ✅ 文書内画像抽出・AI解析
- ✅ ロールメンション対応
- ✅ 知識ベース限定回答システム
- ✅ 回答不能システム
- ✅ ミッション特別処理
- ✅ モジュール化アーキテクチャ
- ✅ Bot User ID検証機能
- ✅ デバッグログシステム
- ✅ Q&A記録機能（Googleスプレッドシート連携）

### 新機能 (v16.0.0)
- 🆕 Q&A自動生成機能（30個サンプル）
- 🆕 毎週火曜日18時 Discord Webhook自動送信
- 🆕 毎日深夜2時 Q&Aサンプル自動補充
- 🆕 使用済みフラグ管理
- 🆕 フルセット生成コマンド

---

## 🚀 セットアップ

### 1. 環境変数の設定

`.env` ファイルを作成し、以下の環境変数を設定してください。

```bash
# Discord Bot設定
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_PUBLIC_KEY=your_public_key_here
BOT_USER_ID=your_bot_user_id_here

# OpenAI API設定
OPENAI_API_KEY=your_openai_api_key_here

# Google サービスアカウント設定
GOOGLE_PROJECT_ID=your_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_CERT_URL=your_cert_url

# スプレッドシートID
KNOWLEDGE_BASE_SPREADSHEET_ID=16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ
QA_SPREADSHEET_ID=your_qa_spreadsheet_id
STUDENT_SPREADSHEET_ID=1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM

# サーバー設定
PORT=10000
NODE_ENV=production
LOG_LEVEL=info
```

詳細な設定方法は `SETUP.md` を参照してください。

### 2. 依存パッケージのインストール

```bash
npm install
```

### 3. Google スプレッドシート準備

#### 知識ベーススプレッドシートに「回答サンプル」シートを作成

スプレッドシートID: `16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ`

新しいシート「回答サンプル」を作成し、以下のヘッダー行を設定:

| A列 | B列 | C列 | D列 |
|-----|-----|-----|-----|
| タイムスタンプ | 質問 | 回答 | 使用済み |

### 4. 初回Q&Aサンプル生成

```bash
# 方法1: npm scriptで30個生成
npm run qa:generate-full

# 方法2: APIエンドポイントで生成
# サーバー起動後、以下にPOSTリクエスト
POST http://your-server/api/qa-automation/generate-full-set
```

**注意**: 30個の生成には約5〜10分かかります。

### 5. サーバー起動

```bash
npm start
```

---

## 📚 API エンドポイント

### ヘルスチェック
```
GET /
```

### Q&A自動生成機能

#### Q&Aサービス状態確認
```
GET /api/qa-generator/status
```

#### Q&Aサンプル件数取得
```
GET /api/qa-generator/count
```
レスポンス例:
```json
{
  "count": 25,
  "target": 30,
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

#### Q&Aペア1つ生成（テスト用）
```
POST /api/qa-generator/generate-one
```

#### Q&A自動補充実行（30個未満の場合のみ）
```
POST /api/qa-automation/run
```
- 不足分を最大5個まで生成
- 30個到達済みの場合はスキップ

#### フルセット生成（30個強制生成）
```
POST /api/qa-automation/generate-full-set
```
- 初回セットアップ用
- 約5〜10分かかります

### 週次送信機能

#### 週次送信タスク手動実行（テスト用）
```
POST /api/webhook/send-weekly
```
レスポンス例:
```json
{
  "success": true,
  "successCount": 15,
  "failCount": 0,
  "totalWebhooks": 15,
  "sampleUsed": 12
}
```

#### 日次チェックタスク手動実行（テスト用）
```
POST /api/webhook/daily-check
```

#### スケジューラー状態確認
```
GET /api/scheduler/status
```
レスポンス例:
```json
{
  "isRunning": true,
  "weeklyTask": "稼働中",
  "dailyCheckTask": "稼働中",
  "schedule": {
    "weekly": "毎週火曜日 18:00 (JST)",
    "daily": "毎日 2:00 (JST)"
  }
}
```

---

## 🔧 npm scripts

```bash
# サーバー起動
npm start

# 開発モード（nodemon）
npm run dev

# Q&Aペア1つ生成
npm run qa:generate-one

# Q&Aフルセット生成（30個）
npm run qa:generate-full

# Q&Aサンプル件数確認
npm run qa:count

# 知識ベース手動更新
npm run knowledge:update

# 知識ベース状態確認
npm run knowledge:status
```

---

## 📅 定期実行スケジュール

### 毎週火曜日 18:00 (JST)
- Discord Webhook送信タスク実行
- 「回答サンプル」から未使用のQ&Aを1つランダム選択
- アクティブ会員全員に送信
- 使用済みフラグを更新

### 毎日 2:00 (JST)
- Q&Aサンプル自動補充チェック
- 30個未満の場合、最大5個まで自動生成
- API制限対策で各生成間に2秒待機

---

## 🌐 Renderデプロイ

### デプロイ手順

1. **GitHubリポジトリにプッシュ**
```bash
git init
git add .
git commit -m "v16.0.0: Q&A自動生成・週次配信機能追加"
git branch -M main
git remote add origin https://github.com/kyo10310415/discord-bot-wannami-v2.git
git push -u origin main
```

2. **Renderでサービス作成**
   - New Web Service
   - リポジトリ接続: `kyo10310415/discord-bot-wannami-v2`
   - Name: `discord-bot-wannami`
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: **Starter ($7/month)** 推奨（スリープ回避）

3. **環境変数設定**
   - Render ダッシュボードから全ての環境変数を設定
   - 特に `TZ=Asia/Tokyo` を追加してタイムゾーンを設定

4. **デプロイ確認**
   - `https://your-service.onrender.com/` でヘルスチェック
   - `https://your-service.onrender.com/api/scheduler/status` でスケジューラー確認

### ⚠️ 重要な注意事項

#### 無料プランの制限
- 15分間アクセスがないとスリープ
- スリープ中はCron実行が停止
- **推奨**: Starter Plan ($7/month) でスリープ回避

#### タイムゾーン設定
- Renderはデフォルトで UTC タイムゾーン
- 環境変数に `TZ=Asia/Tokyo` を追加
- または、Cron式でUTC時間を使用（既に実装済み）

---

## 📊 システムフロー

### 週次送信フロー
```
[毎週火曜日 18:00]
    ↓
[生徒情報スプレッドシート取得]
    ↓
[D列「会員ステータス」= "アクティブ" のみフィルタ]
    ↓
[I列「お役立ち_WH」からWebhook URL取得]
    ↓
[「回答サンプル」シートから未使用Q&Aをランダム選択]
    ↓
[全Webhook URLに同じQ&Aを送信]
    ↓
[使用済みフラグを TRUE に更新]
    ↓
[30個すべて使用済みなら全フラグをリセット]
```

### 日次補充フロー
```
[毎日 2:00]
    ↓
[「回答サンプル」シートの件数確認]
    ↓
[30個未満？]
    ├─ YES → [不足分を最大5個まで生成] → [保存]
    └─ NO  → [スキップ]
```

---

## 🛠️ トラブルシューティング

### Q&A生成が失敗する
- OpenAI API キーが正しいか確認
- Google スプレッドシートの権限を確認
- `回答サンプル` シートが存在するか確認

### Webhook送信が失敗する
- 生徒情報スプレッドシートのアクセス権限を確認
- Webhook URLが正しいか確認
- Discord側のWebhook設定を確認

### スケジューラーが動作しない
- Renderの無料プランでスリープしていないか確認
- `/api/scheduler/status` でスケジューラー状態を確認
- ログを確認してエラーメッセージを確認

---

## 📝 ライセンス

MIT License

## 👨‍💻 作者

VTuber育成スクール

## 🔗 リンク

- GitHub: https://github.com/kyo10310415/discord-bot-wannami-v2
- Issues: https://github.com/kyo10310415/discord-bot-wannami-v2/issues
