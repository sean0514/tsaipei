# 協作流程

`main` 分支受保護，不能直接推送，所有變更都要透過分支 + Pull Request（PR）進行，並且要有人 review 通過才能合併。這樣可以避免不小心改壞正式環境的程式碼。

## 給不熟悉 git 的同事：最簡單的方式（直接在網頁上改）

適合只是要改一兩個檔案的小改動：

1. 到 [GitHub 上這個 repo](https://github.com/sean0514/tsaipei)，打開你要改的檔案（例如 `webapp/src/systems/foodfactory/xxx.jsx`）
2. 點右上角的鉛筆圖示（Edit this file）
3. 改完後，畫面下方選「**Create a new branch for this commit and start a pull request**」，取一個看得懂的分支名稱（例如 `fix-xxx`），按「Propose changes」
4. 系統會自動幫你開好 PR，等 CI 檢查通過、有人 review 之後就會合併

## 熟悉 git 的同事：用指令

```bash
git clone https://github.com/sean0514/tsaipei.git
cd tsaipei
git checkout -b 你的分支名稱   # 例如 fix-shipment-bug

# 改完程式碼之後
cd webapp && npm run build   # 先確認能正常建置
cd ..
git add .
git commit -m "說明這次改了什麼"
git push -u origin 你的分支名稱
```

推上去之後到 GitHub 網頁上開 PR（base 選 `main`），等 CI 檢查通過、有人 review 之後合併。

## Review / 合併

- 每個 PR 都要至少一個人 review 通過，且 CI（`npm run build`）要跑成功，才能合併到 `main`
- 合併到 `main` 後，GitHub Actions 會自動建置並部署到 Firebase Hosting，幾分鐘內正式網站就會更新
- 如果你不確定某個改動會不會有問題，PR 描述裡寫清楚，或直接標記我或熟悉這個系統的人幫忙看

## 一次性設定（repo 管理員要做）

上面「main 受保護」這件事本身要手動開啟一次：

1. GitHub repo → **Settings → Branches**
2. 在 `main` 新增一條 branch protection rule：
   - 勾選 **Require a pull request before merging**（要求至少 1 個 Approval）
   - 勾選 **Require status checks to pass before merging**，選擇 `CI / build` 這個 check（合併過一次 PR 後才會出現在清單裡）
   - 建議也勾選 **Do not allow bypassing the above settings**，連管理員都要走 PR
3. 到 **Settings → Collaborators and teams**，把同事加進來，權限給 **Write**（可以推分支、開 PR，但不能繞過保護規則直接改 main）
