# みぎ？ひだり？ゲーム

5歳くらいの子ども向け。カメラで左右の手上げを判定し、音声の「みぎ あげて！」「ひだり あげて！」に答えるゲームです。

## GitHub Pages で公開

1. GitHubで新しいリポジトリを作る（例: `migi-hidari-game`）
2. このフォルダ内のファイルをすべてリポジトリ直下へアップロード
3. GitHubの `Settings` → `Pages`
4. `Build and deployment` の Source を `Deploy from a branch`
5. Branch を `main`、Folder を `/(root)` にして `Save`
6. 表示された `https://...github.io/.../` をMacまたはiPadで開く
7. 初回だけカメラを「許可」

iPadではSafari推奨です。ホーム画面に追加するとアプリのように起動できます。

## Macでローカル確認

```bash
cd ~/Downloads/migi-hidari-game
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開きます。

## 仕様

- 本人の右手/左手で判定（画面表示だけ鏡像）
- 10問
- 間違えても減点なし
- 両手上げは正解にしない
- 1問ごとに一度両手を下ろしてから次へ
- iPadでは認識頻度を少し下げて負荷を軽減
- MediaPipe Pose Landmarker Liteを利用
