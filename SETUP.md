# セットアップガイド - Discord Bot わなみさん v16.0.0

このガイドでは、Discord Bot わなみさんの環境変数設定とセットアップ方法を詳しく説明します。

---

## 📋 目次

1. [必要な環境変数一覧](#必要な環境変数一覧)
2. [Discord Bot設定](#discord-bot設定)
3. [OpenAI API設定](#openai-api設定)
4. [Google サービスアカウント設定](#google-サービスアカウント設定)
5. [スプレッドシート設定](#スプレッドシート設定)
6. [初回セットアップ手順](#初回セットアップ手順)
7. [Renderデプロイ設定](#renderデプロイ設定)

---

## 必要な環境変数一覧

以下の環境変数を `.env` ファイルまたはRenderの環境変数設定に追加してください。

```bash
# Discord Bot設定
DISCORD_BOT_TOKEN=            # Discord Botトークン（必須）
DISCORD_PUBLIC_KEY=           # Discord公開鍵（必須）
BOT_USER_ID=                  # BotのユーザーID（必須）

# OpenAI API設定
OPENAI_API_KEY=               # OpenAI APIキー（必須）

# Google サービスアカウント設定
GOOGLE_PROJECT_ID=            # GoogleプロジェクトID（必須）
GOOGLE_PRIVATE_KEY_ID=        # 秘密鍵ID（必須）
GOOGLE_PRIVATE_KEY=           # 秘密鍵（必須・複数行）
GOOGLE_CLIENT_EMAIL=          # サービスアカウントメール（必須）
GOOGLE_CLIENT_ID=             # クライアントID（必須）
GOOGLE_CLIENT_CERT_URL=       # 証明書URL（必須）

# スプレッドシートID
KNOWLEDGE_BASE_SPREADSHEET_ID=16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ
QA_SPREADSHEET_ID=            # Q&A記録用スプレッドシートID（オプション）
STUDENT_SPREADSHEET_ID=1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM

# サーバー設定
PORT=10000
NODE_ENV=production
LOG_LEVEL=info
TZ=Asia/Tokyo                 # タイムゾーン設定（Render用）
```

---

## Discord Bot設定

### 1. Discord Developer Portalでアプリケーション作成

1. [Discord Developer Portal](https://discord.com/developers/applications) にアクセス
2. 「New Application」をクリック
3. アプリケーション名を入力（例: わなみさん）

### 2. Botを作成

1. 左メニューから「Bot」を選択
2. 「Add Bot」をクリック
3. 「Reset Token」をクリックしてトークンを取得
   - **DISCORD_BOT_TOKEN**: このトークンを保存

### 3. Bot権限設定

以下の権限を有効化:
- ✅ Presence Intent
- ✅ Server Members Intent
- ✅ Message Content Intent

### 4. 公開鍵とBotユーザーIDを取得

1. 「General Information」タブから公開鍵をコピー
   - **DISCORD_PUBLIC_KEY**: この公開鍵を保存

2. Bot User IDを取得:
   - Botをサーバーに招待後、Discordでユーザー右クリック → 「IDをコピー」
   - **BOT_USER_ID**: このIDを保存

### 5. Botをサーバーに招待

1. 「OAuth2」→「URL Generator」
2. Scopesで「bot」と「applications.commands」を選択
3. Bot Permissionsで以下を選択:
   - Send Messages
   - Read Message History
   - Use Slash Commands
4. 生成されたURLでBotを招待

---

## OpenAI API設定

### 1. OpenAI APIキーを取得

1. [OpenAI Platform](https://platform.openai.com/) にログイン
2. 「API keys」セクションから新しいキーを作成
3. **OPENAI_API_KEY**: このキーを保存

### 2. 使用制限の確認

- Q&A自動生成機能は OpenAI API を使用します
- 30個フルセット生成で約 50,000〜100,000 tokens 消費
- 毎日の自動補充（最大5個）で約 8,000〜17,000 tokens 消費

---

## Google サービスアカウント設定

### 1. Google Cloud Consoleでプロジェクト作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成

### 2. Google Sheets APIとGoogle Drive APIを有効化

1. 「APIとサービス」→「ライブラリ」
2. 「Google Sheets API」を検索して有効化
3. 「Google Drive API」を検索して有効化

### 3. サービスアカウントを作成

1. 「IAMと管理」→「サービスアカウント」
2. 「サービスアカウントを作成」をクリック
3. 名前を入力（例: discord-bot-wannami）
4. 「キーを追加」→「新しいキーを作成」→「JSON」を選択
5. JSONファイルがダウンロードされます

### 4. JSONファイルから環境変数を抽出

ダウンロードしたJSONファイルから以下の値を抽出:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",           // → GOOGLE_PROJECT_ID
  "private_key_id": "your-key-id",           // → GOOGLE_PRIVATE_KEY_ID
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n", // → GOOGLE_PRIVATE_KEY
  "client_email": "your-email@project.iam.gserviceaccount.com", // → GOOGLE_CLIENT_EMAIL
  "client_id": "123456789",                  // → GOOGLE_CLIENT_ID
  "client_x509_cert_url": "https://..."     // → GOOGLE_CLIENT_CERT_URL
}
```

### 5. 秘密鍵 (GOOGLE_PRIVATE_KEY) の注意点

**ローカル開発（.envファイル）:**
```bash
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

**Render環境変数:**
- 改行を `\n` のまま貼り付け
- ダブルクォートは不要

---

## スプレッドシート設定

### 1. 知識ベーススプレッドシート

スプレッドシートID: `16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ`

#### 「回答サンプル」シートを作成

1. スプレッドシートに新しいシートを追加
2. シート名を「回答サンプル」に変更
3. 以下のヘッダー行を A1〜D1 に設定:

| A列 | B列 | C列 | D列 |
|-----|-----|-----|-----|
| タイムスタンプ | 質問 | 回答 | 使用済み |

#### サービスアカウントに権限付与

1. スプレッドシートの「共有」をクリック
2. サービスアカウントのメールアドレス（GOOGLE_CLIENT_EMAIL）を追加
3. 権限を「編集者」に設定

### 2. 生徒情報スプレッドシート

スプレッドシートID: `1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM`

#### シート「❶RAW_生徒様情報」の構造

| D列 | I列 |
|-----|-----|
| 会員ステータス | お役立ち_WH |

- D列に「アクティブ」のデータのみが送信対象
- I列にDiscord Webhook URLを記載

#### サービスアカウントに権限付与

1. スプレッドシートの「共有」をクリック
2. サービスアカウントのメールアドレスを追加
3. 権限を「閲覧者」に設定（読み取りのみ）

### 3. Q&A記録スプレッドシート（オプション）

- 既存のQ&A記録機能を使用する場合のみ設定
- スプレッドシートIDを `QA_SPREADSHEET_ID` に設定
- サービスアカウントに「編集者」権限を付与

---

## 初回セットアップ手順

### 1. リポジトリをクローン

```bash
git clone https://github.com/kyo10310415/discord-bot-wannami-v2.git
cd discord-bot-wannami-v2
```

### 2. 依存パッケージをインストール

```bash
npm install
```

### 3. 環境変数ファイル作成

`.env` ファイルを作成し、上記の環境変数を設定

```bash
cp .env.example .env
# .envファイルを編集
```

### 4. ローカルでテスト起動

```bash
npm start
```

ブラウザで http://localhost:10000 にアクセスして動作確認

### 5. 初回Q&Aサンプル生成

**方法1: npm script（推奨）**
```bash
npm run qa:generate-full
```

**方法2: APIエンドポイント**
```bash
curl -X POST http://localhost:10000/api/qa-automation/generate-full-set
```

⏱️ **所要時間**: 約5〜10分

### 6. 生成結果確認

```bash
npm run qa:count
```

または

```bash
curl http://localhost:10000/api/qa-generator/count
```

期待される出力:
```json
{
  "count": 30,
  "target": 30,
  "timestamp": "2025-01-18T12:00:00.000Z"
}
```

### 7. 週次送信テスト（オプション）

```bash
curl -X POST http://localhost:10000/api/webhook/send-weekly
```

---

## Renderデプロイ設定

### 1. GitHubリポジトリにプッシュ

```bash
git add .
git commit -m "v16.0.0: Initial setup"
git push origin main
```

### 2. Renderでサービス作成

1. [Render Dashboard](https://dashboard.render.com/) にログイン
2. 「New」→「Web Service」
3. GitHubリポジトリを接続
4. 以下を設定:
   - **Name**: discord-bot-wannami
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter ($7/month) 推奨

### 3. 環境変数を設定

Renderダッシュボードの「Environment」タブで全ての環境変数を追加:

```bash
DISCORD_BOT_TOKEN=your_token
DISCORD_PUBLIC_KEY=your_key
BOT_USER_ID=your_id
OPENAI_API_KEY=your_key
GOOGLE_PROJECT_ID=your_id
GOOGLE_PRIVATE_KEY_ID=your_key_id
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
GOOGLE_CLIENT_EMAIL=your_email@project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your_id
GOOGLE_CLIENT_CERT_URL=your_url
KNOWLEDGE_BASE_SPREADSHEET_ID=16BO2pz7Wi36MKwxFZFo5YyaANzVfajkPkXtw1xtSJbQ
STUDENT_SPREADSHEET_ID=1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM
PORT=10000
NODE_ENV=production
LOG_LEVEL=info
TZ=Asia/Tokyo
```

### 4. デプロイ確認

1. Renderで自動デプロイが開始されます
2. デプロイ完了後、「https://your-service.onrender.com/」にアクセス
3. ヘルスチェックでシステム状態を確認

### 5. スケジューラー動作確認

```bash
curl https://your-service.onrender.com/api/scheduler/status
```

期待される出力:
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

## 🔧 トラブルシューティング

### Google Sheets APIエラー

**エラー**: `The caller does not have permission`

**解決策**:
1. サービスアカウントのメールアドレスを確認
2. スプレッドシートの共有設定を確認
3. 権限が「編集者」または「閲覧者」になっているか確認

### OpenAI APIエラー

**エラー**: `Incorrect API key provided`

**解決策**:
1. OpenAI APIキーが正しいか確認
2. APIキーに課金設定がされているか確認
3. 使用制限に達していないか確認

### Cron実行されない

**原因**: Renderの無料プランでスリープ状態

**解決策**:
1. Starter Plan ($7/month) にアップグレード
2. または、UptimeRobotで5分ごとにpingする設定

### タイムゾーンが合わない

**確認方法**:
```bash
curl https://your-service.onrender.com/ | grep timestamp
```

**解決策**:
- 環境変数に `TZ=Asia/Tokyo` を追加

---

## 📞 サポート

問題が解決しない場合は、GitHubのIssuesで報告してください:
https://github.com/kyo10310415/discord-bot-wannami-v2/issues
